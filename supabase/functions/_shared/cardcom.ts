/**
 * Cardcom API v11 client (https://secure.cardcom.solutions/Api/v11/Docs).
 *
 * Field names below come from the published OpenAPI schema. Only what billing
 * needs is typed; Cardcom returns more.
 *
 * Every call carries a timeout. A timed-out charge is an *unknown* outcome, not
 * a failure: callers reconcile it later through `ExternalUniqTranId` rather than
 * assuming the money did or did not move.
 */

const BASE_URL = "https://secure.cardcom.solutions/api/v11";
const REQUEST_TIMEOUT_MS = 20_000;

/** Duplicate `ExternalUniqTranId`: the earlier attempt already reached Cardcom. */
export const CODE_DUPLICATE_TRANSACTION = 608;

/**
 * Master switch. Off unless BILLING_ENABLED is exactly "true", so deploying the
 * code, or pointing it at a live terminal, never starts charging by accident.
 */
export function billingEnabled() {
  return Deno.env.get("BILLING_ENABLED") === "true";
}

export type CardcomConfig = {
  terminal: number;
  apiName: string;
  apiPassword: string;
  /** Issuing a tax document needs the invoice module on the terminal. */
  issueDocuments: boolean;
};

export function cardcomConfig(): CardcomConfig {
  const terminal = Number(Deno.env.get("CARDCOM_TERMINAL"));
  const apiName = Deno.env.get("CARDCOM_API_NAME");
  const apiPassword = Deno.env.get("CARDCOM_API_PASSWORD");
  if (!Number.isInteger(terminal) || terminal <= 0 || !apiName || !apiPassword) {
    throw new Error("cardcom_not_configured");
  }
  return {
    terminal,
    apiName,
    apiPassword,
    issueDocuments: Deno.env.get("CARDCOM_ISSUE_DOCUMENTS") === "true",
  };
}

export type CardcomProduct = { Description: string; UnitCost: number; Quantity: number };

export type CardcomDocument = {
  Name?: string;
  Email?: string;
  IsSendByEmail?: boolean;
  ExternalId?: string;
  Products: CardcomProduct[];
};

export type TransactionInfo = {
  ResponseCode?: number;
  Description?: string;
  TranzactionId?: number;
  TerminalNumber?: number;
  Amount?: number;
  Last4CardDigitsString?: string;
  CardMonth?: number;
  CardYear?: number;
  ApprovalNumber?: string;
  Token?: string;
  DocumentNumber?: number;
};

export type LowProfileResult = {
  ResponseCode?: number;
  Description?: string;
  TerminalNumber?: number;
  LowProfileId?: string;
  TranzactionId?: number;
  ReturnValue?: string;
  Operation?: string;
  DocumentInfo?: { ResponseCode?: number; DocumentNumber?: number; DocumentUrl?: string } | null;
  TokenInfo?: { Token?: string; CardYear?: number; CardMonth?: number } | null;
  TranzactionInfo?: TransactionInfo | null;
};

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`cardcom_http_${response.status}`);
  try {
    return await response.json() as T;
  } catch {
    throw new Error("cardcom_bad_response");
  }
}

/** Formats a card expiry as Cardcom's `MMYY`. */
export function expiryMMYY(month?: number, year?: number): string | null {
  if (!month || !year) return null;
  const yy = String(year).slice(-2);
  return `${String(month).padStart(2, "0")}${yy}`;
}

export async function createLowProfile(params: {
  amount: number;
  returnValue: string;
  productName: string;
  successUrl: string;
  failedUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  document?: CardcomDocument;
  email?: string;
}): Promise<{ lowProfileId: string; url: string }> {
  const config = cardcomConfig();
  const result = await post<{
    ResponseCode?: number;
    Description?: string;
    LowProfileId?: string;
    Url?: string;
  }>("/LowProfile/Create", {
    TerminalNumber: config.terminal,
    ApiName: config.apiName,
    // Charge now and keep a token, which is what renewals charge against.
    Operation: "ChargeAndCreateToken",
    ReturnValue: params.returnValue,
    Amount: params.amount,
    ProductName: params.productName,
    Language: "he",
    ISOCoinId: 1,
    SuccessRedirectUrl: params.successUrl,
    FailedRedirectUrl: params.failedUrl,
    CancelRedirectUrl: params.cancelUrl,
    WebHookUrl: params.webhookUrl,
    UIDefinition: params.email ? { CardOwnerEmailValue: params.email } : undefined,
    Document: config.issueDocuments ? params.document : undefined,
  });

  if (result.ResponseCode !== 0 || !result.LowProfileId || !result.Url) {
    console.error("cardcom_create_failed", { code: result.ResponseCode, description: result.Description });
    throw new Error("cardcom_create_failed");
  }
  return { lowProfileId: result.LowProfileId, url: result.Url };
}

export async function getLpResult(lowProfileId: string): Promise<LowProfileResult> {
  const config = cardcomConfig();
  return await post<LowProfileResult>("/LowProfile/GetLpResult", {
    TerminalNumber: config.terminal,
    ApiName: config.apiName,
    LowProfileId: lowProfileId,
  });
}

export async function chargeToken(params: {
  token: string;
  expiryMMYY: string;
  amount: number;
  externalUniqTranId: string;
  document?: CardcomDocument;
}): Promise<TransactionInfo> {
  const config = cardcomConfig();
  return await post<TransactionInfo>("/Transactions/Transaction", {
    TerminalNumber: config.terminal,
    ApiName: config.apiName,
    Amount: params.amount,
    Token: params.token,
    CardExpirationMMYY: params.expiryMMYY,
    ISOCoinId: 1,
    ExternalUniqTranId: params.externalUniqTranId,
    Document: config.issueDocuments ? params.document : undefined,
  });
}

/** Looks up a charge by the idempotency key we sent. */
export async function getTransactionByExternalId(externalUniqTranId: string): Promise<TransactionInfo> {
  const config = cardcomConfig();
  return await post<TransactionInfo>("/Transactions/GetTransactionByExternalUniqTran", {
    TerminalNumber: config.terminal,
    ApiName: config.apiName,
    ExternalUniqTranId: externalUniqTranId,
  });
}

export async function refundTransaction(params: {
  transactionId: number;
  partialSum?: number;
}): Promise<{ ok: boolean; code?: number; description?: string; newTransactionId?: number }> {
  const config = cardcomConfig();
  const result = await post<{ ResponseCode?: number; Description?: string; NewTranzactionId?: number }>(
    "/Transactions/RefundByTransactionId",
    {
      ApiName: config.apiName,
      ApiPassword: config.apiPassword,
      TransactionId: params.transactionId,
      PartialSum: params.partialSum,
    },
  );
  return {
    ok: result.ResponseCode === 0,
    code: result.ResponseCode,
    description: result.Description,
    newTransactionId: result.NewTranzactionId,
  };
}
