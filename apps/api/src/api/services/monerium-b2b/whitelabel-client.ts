import httpStatus from "http-status";
import { config } from "../../../config/vars";
import { APIError } from "../../errors/api-error";
import { LINK_MESSAGE } from "./attestor";

/**
 * Thin Monerium whitelabel API client (client-credentials flow, sandbox-first).
 * Endpoints per docs.monerium.com/api: POST /auth/token, POST /profiles,
 * POST /addresses, POST /ibans, GET /ibans, GET /orders/{orderId}.
 * Only the endpoints the B2B onramp needs — no speculative surface.
 */

const FETCH_TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const API_V2_ACCEPT = "application/vnd.monerium.api-v2+json";

export type MoneriumProfileKind = "personal" | "corporate";

export interface WhitelabelProfile {
  id: string;
  kind: MoneriumProfileKind;
  state: string;
}

export interface WhitelabelIban {
  iban: string;
  bic?: string;
  address: string;
  chain: string;
}

export interface WhitelabelOrder {
  id: string;
  state: string;
  kind?: string;
  amount?: string;
  currency?: string;
  address?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<CachedToken> | null = null;

function upstreamError(_internalMessage: string): APIError {
  return new APIError({ message: "Monerium request failed", status: httpStatus.BAD_GATEWAY });
}

async function fetchToken(): Promise<CachedToken> {
  const { apiUrl, clientId, clientSecret } = config.moneriumB2b;
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/auth/token`, {
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch {
    throw upstreamError("Monerium token request timed out or failed");
  }
  if (!response.ok) {
    throw upstreamError(`Monerium token endpoint returned HTTP ${response.status}`);
  }
  const token = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!token || typeof token.access_token !== "string" || typeof token.expires_in !== "number" || token.expires_in <= 0) {
    throw upstreamError("Monerium returned an invalid token response");
  }
  return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!config.moneriumB2b.clientId || !config.moneriumB2b.clientSecret) {
    throw new APIError({
      message: "Monerium B2B client credentials are not configured",
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
    return cachedToken.accessToken;
  }
  if (!tokenRequest) {
    tokenRequest = fetchToken()
      .then(token => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        tokenRequest = null;
      });
  }
  return (await tokenRequest).accessToken;
}

async function request(path: string, init: { body?: unknown; method: "GET" | "POST" }): Promise<unknown> {
  const doFetch = async (accessToken: string): Promise<Response> => {
    try {
      return await fetch(`${config.moneriumB2b.apiUrl}${path}`, {
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: {
          Accept: API_V2_ACCEPT,
          Authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" })
        },
        method: init.method,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
    } catch {
      throw upstreamError("Monerium request timed out or failed");
    }
  };

  let response = await doFetch(await getAccessToken());
  if (response.status === 401) {
    // Client-credentials tokens are not refreshable — a 401 means expired/revoked; mint a new one once.
    response = await doFetch(await getAccessToken(true));
  }
  if (!response.ok) {
    throw upstreamError(`Monerium returned HTTP ${response.status} for ${init.method} ${path}`);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw upstreamError("Monerium returned invalid JSON");
  }
}

/** POST /profiles — partner-created profile (whitelabel). */
export async function createProfile(kind: MoneriumProfileKind): Promise<WhitelabelProfile> {
  const profile = (await request("/profiles", { body: { kind }, method: "POST" })) as Record<string, unknown>;
  if (!profile || typeof profile.id !== "string" || profile.kind !== kind || typeof profile.state !== "string") {
    throw upstreamError("Monerium returned an invalid profile");
  }
  return { id: profile.id, kind, state: profile.state };
}

/**
 * Corporate KYB submission for a whitelabel profile.
 *
 * Deliberately a stub: the KYB mechanism under whitelabel (Monerium-run verification vs
 * KYC-reliance) is pending the MSA negotiation — deferred-decisions registry item T3.
 * Do not build a speculative payload shape against it.
 */
export async function submitKybData(_profileId: string, _data: unknown): Promise<never> {
  throw new APIError({
    message: "Monerium B2B KYB submission is not implemented (pending registry item T3)",
    status: httpStatus.NOT_IMPLEMENTED
  });
}

/**
 * POST /addresses — links a forwarder address to a profile using the attestor's
 * EIP-1271-verifiable signature over the fixed link message (see ./attestor.ts).
 */
export async function linkAddress(profileId: string, address: string, chain: string, signature: string): Promise<unknown> {
  return request("/addresses", {
    body: { address, chain, message: LINK_MESSAGE, profile: profileId, signature },
    method: "POST"
  });
}

/** POST /ibans — requests IBAN issuance for a linked address. */
export async function requestIban(address: string, chain: string): Promise<unknown> {
  return request("/ibans", { body: { address, chain }, method: "POST" });
}

/** GET /ibans — all IBANs visible to the partner context (association monitor + lookups). */
export async function listIbans(): Promise<WhitelabelIban[]> {
  const response = (await request("/ibans", { method: "GET" })) as { ibans?: unknown } | unknown[] | null;
  const entries = Array.isArray(response) ? response : Array.isArray(response?.ibans) ? response.ibans : [];
  const ibans: WhitelabelIban[] = [];
  for (const entry of entries as Record<string, unknown>[]) {
    if (typeof entry?.iban === "string" && typeof entry.address === "string") {
      ibans.push({
        address: entry.address,
        bic: typeof entry.bic === "string" ? entry.bic : undefined,
        chain: typeof entry.chain === "string" ? entry.chain : "",
        iban: entry.iban
      });
    }
  }
  return ibans;
}

/** GET /ibans — returns the IBAN issued for an address, or null if none yet. */
export async function getIbanForAddress(address: string): Promise<WhitelabelIban | null> {
  const ibans = await listIbans();
  return ibans.find(entry => entry.address.toLowerCase() === address.toLowerCase()) ?? null;
}

/**
 * GET /addresses?profile={id} — the addresses linked to a profile. Used by the
 * association monitor (S1 detective control): any address linked to a client profile
 * beyond the forwarder is an alert condition.
 */
export async function getProfileAddresses(profileId: string): Promise<string[]> {
  const response = (await request(`/addresses?profile=${encodeURIComponent(profileId)}`, { method: "GET" })) as
    | { addresses?: unknown }
    | unknown[]
    | null;
  const entries = Array.isArray(response) ? response : Array.isArray(response?.addresses) ? response.addresses : [];
  const addresses: string[] = [];
  for (const entry of entries as Record<string, unknown>[]) {
    if (typeof entry?.address === "string") {
      addresses.push(entry.address);
    }
  }
  return addresses;
}

/** GET /orders/{orderId} */
export async function getOrder(orderId: string): Promise<WhitelabelOrder> {
  const order = (await request(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" })) as Record<string, unknown>;
  if (!order || typeof order.id !== "string" || typeof order.state !== "string") {
    throw upstreamError("Monerium returned an invalid order");
  }
  return {
    address: typeof order.address === "string" ? order.address : undefined,
    amount: typeof order.amount === "string" ? order.amount : undefined,
    currency: typeof order.currency === "string" ? order.currency : undefined,
    id: order.id,
    kind: typeof order.kind === "string" ? order.kind : undefined,
    state: order.state
  };
}

export function resetMoneriumB2bClientForTests(): void {
  cachedToken = null;
  tokenRequest = null;
}
