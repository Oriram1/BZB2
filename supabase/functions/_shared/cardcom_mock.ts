/**
 * A local stand-in for the Cardcom v11 API, for tests only.
 *
 * It mimics the response shapes the billing code reads, not Cardcom's real
 * behaviour, so it proves OUR logic and says nothing about field names being
 * right. That still needs one run against a real test terminal.
 *
 * Auth follows what the real API does: a wrong ApiName is 401 with code 603.
 */
export const MOCK_TERMINAL = 1000;
export const MOCK_API_NAME = "mock-api";
export const MOCK_API_PASSWORD = "mock-password";

export type MockPayment = {
  returnValue: string;
  successUrl?: string;
  failedUrl?: string;
  cancelUrl?: string;
  /** What the hosted page ended up as. `none` = customer has not paid yet. */
  outcome: "none" | "paid" | "declined";
  amount: number;
  /** Cardcom's `Operation`; `CreateTokenOnly` saves the card and charges nothing. */
  operation: string;
};

export type MockCardcom = {
  url: string;
  /** LowProfileId -> payment, filled when a page is created. */
  pages: Map<string, MockPayment>;
  /** ExternalUniqTranId -> transaction id, for duplicate detection. */
  charges: Map<string, number>;
  requests: { path: string; body: Record<string, unknown> }[];
  close: () => Promise<void>;
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * `publicBase` is how a browser reaches this server, for the hosted-page URL it
 * hands out. Visiting `<publicBase>/pay/<id>?outcome=paid|declined|cancel` plays
 * the customer finishing the page and redirects like Cardcom would.
 */
export function startMockCardcom(port = 0, publicBaseOverride?: string): MockCardcom {
  // With port 0 the real port is only known once the server is listening.
  let publicBase = publicBaseOverride ?? `http://127.0.0.1:${port}`;
  const pages = new Map<string, MockPayment>();
  const charges = new Map<string, number>();
  const requests: MockCardcom["requests"] = [];
  let nextPage = 1;
  const pagePrefix = `lp${Date.now().toString(36)}-`;
  let nextTransaction = 9000;
  // A long-lived database would otherwise see the same ids again after a restart.
  nextTransaction += Math.floor(Date.now() / 1000) % 1_000_000;

  const server = Deno.serve({ hostname: "127.0.0.1", port, onListen() {} }, async (req) => {
    const requestUrl = new URL(req.url);
    const payMatch = req.method === "GET" && requestUrl.pathname.match(/^\/pay\/([^/]+)$/);
    if (payMatch) {
      const page = pages.get(payMatch[1]);
      if (!page) return new Response("unknown page", { status: 404 });
      const outcome = requestUrl.searchParams.get("outcome");
      if (!outcome) {
        // A stand-in for Cardcom's card page: three buttons instead of a card form.
        const link = (value: string, label: string) =>
          `<p><a href="${requestUrl.pathname}?outcome=${value}" style="font:20px sans-serif">${label}</a></p>`;
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>Cardcom mock</title><body dir="rtl" style="padding:40px">` +
            `<h1>Cardcom (mock)</h1><p>סכום: ${page.amount} ₪</p>` +
            link("paid", "שלם (כרטיס מאושר)") + link("declined", "כרטיס נדחה") + link("cancel", "בטל") +
            `</body>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (outcome === "paid" || outcome === "declined") page.outcome = outcome;
      const target = outcome === "paid" ? page.successUrl : outcome === "declined" ? page.failedUrl : page.cancelUrl;
      if (!target) return new Response("no redirect", { status: 404 });
      return Response.redirect(`${target}${target.includes("?") ? "&" : "?"}lowprofilecode=${payMatch[1]}`, 302);
    }
    const path = requestUrl.pathname.replace(/^\/api\/v11/, "");
    const body = await req.json() as Record<string, unknown>;
    requests.push({ path, body });

    if (body.ApiName !== MOCK_API_NAME) {
      return reply({ ResponseCode: 603, Description: "שם משתמש או סיסמה שגויים" }, 401);
    }

    switch (path) {
      case "/LowProfile/Create": {
        const id = `${pagePrefix}${nextPage++}`;
        pages.set(id, {
          returnValue: String(body.ReturnValue),
          successUrl: String(body.SuccessRedirectUrl ?? ""),
          failedUrl: String(body.FailedRedirectUrl ?? ""),
          cancelUrl: String(body.CancelRedirectUrl ?? ""),
          outcome: "none",
          amount: Number(body.Amount),
          operation: String(body.Operation ?? "ChargeOnly"),
        });
        return reply({ ResponseCode: 0, LowProfileId: id, Url: `${publicBase}/pay/${id}` });
      }
      case "/LowProfile/GetLpResult": {
        const page = pages.get(String(body.LowProfileId));
        if (!page) return reply({ ResponseCode: 1, Description: "not found" });
        const result: Record<string, unknown> = {
          ResponseCode: 0,
          TerminalNumber: MOCK_TERMINAL,
          ReturnValue: page.returnValue,
        };
        if (page.outcome === "paid" && page.operation === "CreateTokenOnly") {
          // Card saved, nothing charged: a token and no transaction.
          const id = nextTransaction++;
          result.TokenInfo = { Token: `tok-${id}`, CardMonth: 4, CardYear: 2029 };
        } else if (page.outcome === "paid") {
          const id = nextTransaction++;
          result.TranzactionId = id;
          result.TokenInfo = { Token: `tok-${id}`, CardMonth: 4, CardYear: 2029 };
          result.TranzactionInfo = {
            ResponseCode: 0,
            Amount: page.amount,
            TranzactionId: id,
            Last4CardDigitsString: "4580",
          };
        } else if (page.outcome === "declined") {
          result.TranzactionInfo = { ResponseCode: 5033, Description: "declined" };
        }
        return reply(result);
      }
      case "/Transactions/Transaction": {
        const key = String(body.ExternalUniqTranId);
        // Cardcom rejects anything longer; the real terminal said "UniqAsmachta Maxlen is 50".
        if (key.length > 50) return reply({ ResponseCode: 1, Description: "UniqAsmachta Maxlen is 50" });
        if (charges.has(key)) return reply({ ResponseCode: 608, Description: "duplicate" });
        if (body.Token === "tok-decline") return reply({ ResponseCode: 39, Description: "no funds" });
        const id = nextTransaction++;
        charges.set(key, id);
        return reply({ ResponseCode: 0, TranzactionId: id, Amount: body.Amount, Last4CardDigitsString: "4580" });
      }
      case "/Transactions/GetTransactionByExternalUniqTran": {
        const id = charges.get(String(body.ExternalUniqTranId));
        if (id === undefined) return reply({ ResponseCode: 1, Description: "not found" });
        return reply({ ResponseCode: 0, TranzactionId: id });
      }
      case "/Transactions/RefundByTransactionId": {
        if (body.ApiPassword !== MOCK_API_PASSWORD) return reply({ ResponseCode: 603, Description: "bad password" }, 401);
        return reply({ ResponseCode: 0, NewTranzactionId: nextTransaction++ });
      }
      case "/Documents/CreateDocumentUrl": {
        if (body.ApiPassword !== MOCK_API_PASSWORD) return reply({ ResponseCode: 603, Description: "bad password" }, 401);
        return reply({ ResponseCode: 0, DocUrl: `${publicBase}/doc/${body.DocumentType}/${body.DocumentNumber}` });
      }
      default:
        return reply({ ResponseCode: 404, Description: "unknown endpoint" }, 404);
    }
  });

  if (!publicBaseOverride) publicBase = `http://127.0.0.1:${server.addr.port}`;

  return {
    url: `http://127.0.0.1:${server.addr.port}/api/v11`,
    pages,
    charges,
    requests,
    close: () => server.shutdown(),
  };
}
