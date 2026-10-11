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
  /** What the hosted page ended up as. `none` = customer has not paid yet. */
  outcome: "none" | "paid" | "declined";
  amount: number;
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

export function startMockCardcom(port = 0): MockCardcom {
  const pages = new Map<string, MockPayment>();
  const charges = new Map<string, number>();
  const requests: MockCardcom["requests"] = [];
  let nextPage = 1;
  let nextTransaction = 9000;

  const server = Deno.serve({ hostname: "127.0.0.1", port, onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname.replace(/^\/api\/v11/, "");
    const body = await req.json() as Record<string, unknown>;
    requests.push({ path, body });

    if (body.ApiName !== MOCK_API_NAME) {
      return reply({ ResponseCode: 603, Description: "שם משתמש או סיסמה שגויים" }, 401);
    }

    switch (path) {
      case "/LowProfile/Create": {
        const id = `lp-${nextPage++}`;
        pages.set(id, { returnValue: String(body.ReturnValue), outcome: "none", amount: Number(body.Amount) });
        return reply({ ResponseCode: 0, LowProfileId: id, Url: `http://127.0.0.1/pay/${id}` });
      }
      case "/LowProfile/GetLpResult": {
        const page = pages.get(String(body.LowProfileId));
        if (!page) return reply({ ResponseCode: 1, Description: "not found" });
        const result: Record<string, unknown> = {
          ResponseCode: 0,
          TerminalNumber: MOCK_TERMINAL,
          ReturnValue: page.returnValue,
        };
        if (page.outcome === "paid") {
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
      default:
        return reply({ ResponseCode: 404, Description: "unknown endpoint" }, 404);
    }
  });

  return {
    url: `http://127.0.0.1:${server.addr.port}/api/v11`,
    pages,
    charges,
    requests,
    close: () => server.shutdown(),
  };
}
