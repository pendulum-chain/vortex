import { EvmNetworks, Networks } from "@vortexfi/shared";
import { MYKOBO_ACCESS_KEY, MYKOBO_SECRET_KEY, SANDBOX_ENABLED } from "../../../constants/constants";

const MYKOBO_API_URL = SANDBOX_ENABLED ? "https://api-dev.mykobo.app/v1" : "https://api.mykobo.app/v1";

export const MYKOBO_BASE_NETWORK: EvmNetworks = (SANDBOX_ENABLED ? Networks.BaseSepolia : Networks.Base) as EvmNetworks;

export const isBaseEvmNetwork = (network: string | undefined): boolean =>
  network === Networks.Base || network === Networks.BaseSepolia;

export const MYKOBO_CURRENCY = "EURC" as const;

export type MykoboTransactionType = "DEPOSIT" | "WITHDRAW";
export type MykoboFeeKind = "deposit" | "withdraw";

export type MykoboKycReviewStatus = "pending" | "approved" | "rejected";

export interface MykoboKycStatus {
  received_at: string | null;
  review_status: MykoboKycReviewStatus;
}

export interface MykoboProfile {
  first_name: string;
  last_name: string;
  email_address: string;
  bank_account_number: string;
  kyc_status: MykoboKycStatus;
  created_at: string;
}

export interface MykoboDepositInstructions {
  bank_account_name: string;
  iban: string;
  bic?: string;
}

export interface MykoboWithdrawInstructions {
  address: string;
}

export interface MykoboTransaction {
  id: string;
  reference: string;
  transaction_type: MykoboTransactionType;
  status: string;
  incoming_currency?: string;
  outgoing_currency?: string;
  value: string;
  fee?: string;
  wallet_address: string;
  network?: string;
  tx_hash?: string;
  created_at: string;
  updated_at: string;
}

export type MykoboIntent = MykoboTransaction & {
  instructions?: MykoboDepositInstructions | MykoboWithdrawInstructions;
};

interface MykoboIntentResponse {
  transaction: MykoboTransaction;
  instructions?: MykoboDepositInstructions | MykoboWithdrawInstructions;
}

export interface MykoboFees {
  total: string;
  percentage: string;
  asset?: string;
}

interface CreateIntentParams {
  walletAddress: string;
  emailAddress: string;
  value: string;
  ipAddress: string;
  memo?: string;
  clientDomain?: string;
}

interface TokenResponse {
  subject_id: string;
  token: string;
  refresh_token: string;
}

interface CachedToken {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

// JWT exp is in seconds; we refresh proactively 60 s before the documented expiry.
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
let cachedToken: CachedToken | null = null;
let inflightToken: Promise<CachedToken> | null = null;

const parseJwtExpiryMs = (jwt: string): number => {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return Date.now() + 5 * 60_000;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    if (typeof decoded.exp !== "number") return Date.now() + 5 * 60_000;
    return decoded.exp * 1000;
  } catch {
    return Date.now() + 5 * 60_000;
  }
};

const acquireToken = async (): Promise<CachedToken> => {
  if (!MYKOBO_ACCESS_KEY || !MYKOBO_SECRET_KEY) {
    throw new Error("MYKOBO_ACCESS_KEY and MYKOBO_SECRET_KEY must be configured");
  }
  const response = await fetch(`${MYKOBO_API_URL}/auth/token`, {
    body: JSON.stringify({ access_key: MYKOBO_ACCESS_KEY, secret_key: MYKOBO_SECRET_KEY }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mykobo token acquisition failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as TokenResponse;
  return {
    expiresAt: parseJwtExpiryMs(data.token),
    refreshToken: data.refresh_token,
    token: data.token
  };
};

const refreshToken = async (current: CachedToken): Promise<CachedToken> => {
  const response = await fetch(`${MYKOBO_API_URL}/auth/refresh`, {
    body: JSON.stringify({ refresh_token: current.refreshToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    return acquireToken();
  }
  const data = (await response.json()) as TokenResponse;
  return {
    expiresAt: parseJwtExpiryMs(data.token),
    refreshToken: data.refresh_token,
    token: data.token
  };
};

const getBearerToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_LEEWAY_MS > Date.now()) {
    return cachedToken.token;
  }
  if (inflightToken) {
    const t = await inflightToken;
    return t.token;
  }
  inflightToken = (async () => {
    const next = cachedToken ? await refreshToken(cachedToken) : await acquireToken();
    cachedToken = next;
    return next;
  })();
  try {
    const t = await inflightToken;
    return t.token;
  } finally {
    inflightToken = null;
  }
};

const invalidateToken = () => {
  cachedToken = null;
};

interface FetchOptions {
  method?: "GET" | "POST";
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

const mykoboFetch = async (path: string, options: FetchOptions = {}): Promise<Response> => {
  const url = `${MYKOBO_API_URL}${path}`;
  const doFetch = async (token: string) =>
    fetch(url, {
      body: options.body ?? null,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers
      },
      method: options.method ?? "GET"
    });

  let response = await doFetch(await getBearerToken());
  if (response.status === 401) {
    invalidateToken();
    response = await doFetch(await getBearerToken());
  }
  return response;
};

interface MykoboProfileResponse {
  profile: MykoboProfile;
  verification?: unknown;
}

export const getMykoboProfile = async (walletAddress: string, memo?: string): Promise<MykoboProfile | null> => {
  const query = new URLSearchParams({ address: walletAddress });
  if (memo) query.append("memo", memo);
  const response = await mykoboFetch(`/profiles?${query.toString()}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Mykobo profile lookup failed: ${response.status} ${response.statusText}`);
  }
  const wrapper = (await response.json()) as MykoboProfileResponse;
  return wrapper.profile;
};

export const createMykoboProfile = async (formData: FormData): Promise<MykoboProfile> => {
  const response = await mykoboFetch("/profiles", { body: formData, method: "POST" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mykobo profile creation failed: ${response.status} ${text}`);
  }
  const wrapper = (await response.json()) as MykoboProfileResponse;
  return wrapper.profile;
};

const createTransactionIntent = async (
  transactionType: MykoboTransactionType,
  params: CreateIntentParams
): Promise<MykoboIntent> => {
  const body = {
    client_domain: params.clientDomain,
    currency: MYKOBO_CURRENCY,
    email_address: params.emailAddress,
    ip_address: params.ipAddress,
    memo: params.memo,
    transaction_type: transactionType,
    value: params.value,
    wallet_address: params.walletAddress
  };
  const response = await mykoboFetch("/transactions/intent", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mykobo ${transactionType} intent failed: ${response.status} ${text}`);
  }
  const wrapper = (await response.json()) as MykoboIntentResponse;
  return { ...wrapper.transaction, instructions: wrapper.instructions };
};

export const createMykoboDepositIntent = (params: CreateIntentParams): Promise<MykoboIntent> =>
  createTransactionIntent("DEPOSIT", params);

export const createMykoboWithdrawIntent = (params: CreateIntentParams): Promise<MykoboIntent> =>
  createTransactionIntent("WITHDRAW", params);

export const getMykoboTransaction = async (transactionId: string): Promise<MykoboIntent> => {
  const response = await mykoboFetch(`/transactions/${encodeURIComponent(transactionId)}`);
  if (!response.ok) {
    throw new Error(`Mykobo transaction lookup failed: ${response.status} ${response.statusText}`);
  }
  const wrapper = (await response.json()) as MykoboIntentResponse;
  return { ...wrapper.transaction, instructions: wrapper.instructions };
};

export const getMykoboFees = async (value: string, kind: MykoboFeeKind, clientDomain?: string): Promise<MykoboFees> => {
  const query = new URLSearchParams({ kind, value });
  if (clientDomain) query.append("client_domain", clientDomain);
  const response = await mykoboFetch(`/fees?${query.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mykobo fees lookup failed: ${response.status} ${text}`);
  }
  return (await response.json()) as MykoboFees;
};

export const isMykoboDepositInstructions = (
  instructions: MykoboDepositInstructions | MykoboWithdrawInstructions | undefined
): instructions is MykoboDepositInstructions =>
  !!instructions && "iban" in instructions && typeof (instructions as MykoboDepositInstructions).iban === "string";

export const isMykoboWithdrawInstructions = (
  instructions: MykoboDepositInstructions | MykoboWithdrawInstructions | undefined
): instructions is MykoboWithdrawInstructions =>
  !!instructions && "address" in instructions && typeof (instructions as MykoboWithdrawInstructions).address === "string";
