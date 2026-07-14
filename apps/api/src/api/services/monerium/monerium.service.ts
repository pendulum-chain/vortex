import crypto from "crypto";
import httpStatus from "http-status";
import NodeCache from "node-cache";
import sequelize from "../../../config/database";
import { config } from "../../../config/vars";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, {
  MoneriumStatus,
  ProviderCustomerType,
  VerificationStatus
} from "../../../models/providerCustomer.model";
import { APIError } from "../../errors/api-error";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";
import { cache } from "../index";

const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;
const FETCH_TIMEOUT_MS = 10_000;
export const MONERIUM_REAUTHENTICATION_REQUIRED = "MONERIUM_REAUTHENTICATION_REQUIRED";
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
const API_V2_ACCEPT = "application/vnd.monerium.api-v2+json";

interface OAuthTransaction {
  customerEntityId: string;
  customerType: ProviderCustomerType;
  expectedEmail: string;
  redirectUri: string;
  userId: string;
  verifier: string;
}

interface MoneriumCredentials {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
}

interface ProfileReference {
  id?: unknown;
  kind?: unknown;
}

interface MoneriumContext {
  defaultProfile?: unknown;
  email?: unknown;
  profiles?: unknown;
  userId?: unknown;
}

export interface MoneriumProfile {
  id: string;
  kind: "personal" | "corporate";
  state: string;
}

export interface MoneriumStatusResponse {
  customerType: ProviderCustomerType;
  profileId: string;
  status: MoneriumStatus;
  statusExternal: string;
}

const refreshes = new Map<string, Promise<MoneriumCredentials>>();
const credentialCache = new NodeCache({ checkperiod: 600, maxKeys: 5000, stdTTL: CREDENTIAL_TTL_SECONDS, useClones: false });

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return base64Url(crypto.createHash("sha256").update(verifier, "ascii").digest());
}

function stateCacheKey(state: string): string {
  return `monerium:oauth:${crypto.createHash("sha256").update(state, "utf8").digest("hex")}`;
}

function credentialsCacheKey(customerEntityId: string, customerType: ProviderCustomerType): string {
  return `monerium:credentials:${customerEntityId}:${customerType}`;
}

function providerKind(customerType: ProviderCustomerType): MoneriumProfile["kind"] {
  return customerType === "business" ? "corporate" : "personal";
}

export function mapMoneriumProfileState(state: string): MoneriumStatus {
  switch (state.trim().toLowerCase()) {
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

function toVerificationStatus(status: MoneriumStatus, statusExternal: string): VerificationStatus {
  if (status === "APPROVED") return VerificationStatus.Approved;
  if (status === "REJECTED") return VerificationStatus.Rejected;
  if (["authorization_started", "created", "incomplete"].includes(statusExternal.trim().toLowerCase())) {
    return VerificationStatus.Started;
  }
  return VerificationStatus.InReview;
}

export function selectMoneriumProfile(
  profiles: unknown,
  customerType: ProviderCustomerType,
  defaultProfile?: unknown
): { id: string; kind: string } {
  if (!Array.isArray(profiles)) {
    throw upstreamError("Monerium context did not contain profiles");
  }

  const expectedKind = providerKind(customerType);
  const matches = (profiles as ProfileReference[])
    .filter(profile => typeof profile.id === "string" && profile.kind === expectedKind)
    .map(profile => ({ id: profile.id as string, kind: profile.kind as string }));

  if (matches.length === 0) {
    throw new APIError({ message: `No ${expectedKind} Monerium profile found`, status: httpStatus.NOT_FOUND });
  }
  const selectedDefault = matches.find(profile => profile.id === defaultProfile);
  if (selectedDefault) return selectedDefault;
  if (matches.length > 1) {
    throw new APIError({ message: `Multiple ${expectedKind} Monerium profiles found`, status: httpStatus.CONFLICT });
  }
  return matches[0];
}

function upstreamError(_internalMessage: string): APIError {
  return new APIError({ message: "Monerium request failed", status: httpStatus.BAD_GATEWAY });
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw upstreamError("Monerium request timed out or failed");
  }
  if (!response.ok) {
    throw upstreamError(`Monerium returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw upstreamError("Monerium returned invalid JSON");
  }
}

function parseTokenResponse(value: unknown): MoneriumCredentials {
  const token = value as TokenResponse;
  if (
    !token ||
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  ) {
    throw upstreamError("Monerium returned an invalid token response");
  }
  return {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken: token.refresh_token
  };
}

async function requestToken(params: URLSearchParams): Promise<MoneriumCredentials> {
  const response = await fetchJson(`${config.monerium.apiUrl}/auth/token`, {
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  return parseTokenResponse(response);
}

async function getValidCredentials(customerEntityId: string, customerType: ProviderCustomerType): Promise<MoneriumCredentials> {
  const key = credentialsCacheKey(customerEntityId, customerType);
  const credentials = credentialCache.get<MoneriumCredentials>(key);
  if (!credentials) {
    throw new APIError({
      message: "Monerium reauthentication is required",
      status: httpStatus.NOT_FOUND,
      type: MONERIUM_REAUTHENTICATION_REQUIRED
    });
  }
  if (credentials.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
    credentialCache.ttl(key, CREDENTIAL_TTL_SECONDS);
    return credentials;
  }

  const inFlight = refreshes.get(key);
  if (inFlight) return inFlight;

  const refresh = requestToken(
    new URLSearchParams({
      client_id: config.monerium.clientId,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken
    })
  ).then(rotated => {
    credentialCache.set(key, rotated);
    return rotated;
  });
  refreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    refreshes.delete(key);
  }
}

async function readProfile(
  credentials: MoneriumCredentials,
  customerType: ProviderCustomerType
): Promise<{ context: MoneriumContext & { email: string; userId: string }; profile: MoneriumProfile }> {
  const headers = { Accept: API_V2_ACCEPT, Authorization: `Bearer ${credentials.accessToken}` };
  const context = (await fetchJson(`${config.monerium.apiUrl}/auth/context`, { headers, method: "GET" })) as MoneriumContext;
  if (typeof context.email !== "string" || typeof context.userId !== "string") {
    throw upstreamError("Monerium context did not contain an authenticated identity");
  }
  const selected = selectMoneriumProfile(context.profiles, customerType, context.defaultProfile);
  const rawProfile = (await fetchJson(`${config.monerium.apiUrl}/profiles/${encodeURIComponent(selected.id)}`, {
    headers,
    method: "GET"
  })) as Record<string, unknown>;

  if (rawProfile.id !== selected.id || rawProfile.kind !== selected.kind || typeof rawProfile.state !== "string") {
    throw upstreamError("Monerium returned an invalid profile");
  }
  return {
    context: context as MoneriumContext & { email: string; userId: string },
    profile: rawProfile as unknown as MoneriumProfile
  };
}

async function mirrorProfile(
  customerEntityId: string,
  customerType: ProviderCustomerType,
  profile: MoneriumProfile
): Promise<MoneriumStatusResponse> {
  const status = mapMoneriumProfileState(profile.state);
  const verificationStatus = toVerificationStatus(status, profile.state);
  await sequelize.transaction(async transaction => {
    const [customer] = await ProviderCustomer.findOrCreate({
      defaults: {
        customerEntityId,
        customerType,
        provider: "monerium",
        providerCustomerId: profile.id,
        rail: "eur",
        status: verificationStatus,
        statusExternal: profile.state
      },
      transaction,
      where: { customerEntityId, customerType, provider: "monerium", rail: "eur" }
    });
    if (customer.providerCustomerId && customer.providerCustomerId !== profile.id) {
      throw new APIError({ message: "Monerium profile does not match the existing account", status: httpStatus.CONFLICT });
    }
    await customer.update(
      { providerCustomerId: profile.id, status: verificationStatus, statusExternal: profile.state },
      { transaction }
    );

    const existingCase = await KycCase.findOne({ transaction, where: { providerCustomerId: customer.id } });
    if (existingCase) {
      await existingCase.update(
        {
          approvedAt: verificationStatus === VerificationStatus.Approved ? (existingCase.approvedAt ?? new Date()) : null,
          providerCaseId: profile.id,
          rejectedAt: verificationStatus === VerificationStatus.Rejected ? (existingCase.rejectedAt ?? new Date()) : null,
          status: verificationStatus,
          statusExternal: profile.state
        },
        { transaction }
      );
    } else {
      await KycCase.create(
        {
          customerEntityId,
          provider: "monerium",
          providerCaseId: profile.id,
          providerCustomerId: customer.id,
          status: verificationStatus,
          statusExternal: profile.state,
          submittedAt: new Date(),
          type: customerType === "business" ? "kyb" : "kyc",
          ...(verificationStatus === VerificationStatus.Approved ? { approvedAt: new Date() } : {}),
          ...(verificationStatus === VerificationStatus.Rejected ? { rejectedAt: new Date() } : {})
        },
        { transaction }
      );
    }
  });
  return { customerType, profileId: profile.id, status, statusExternal: profile.state };
}

export async function startMoneriumOAuth(
  userId: string,
  email: string,
  customerType: ProviderCustomerType
): Promise<{ authorizationUrl: string }> {
  if (!config.monerium.clientId) {
    throw new APIError({ message: "Monerium OAuth is not configured", status: httpStatus.SERVICE_UNAVAILABLE });
  }
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  if (entity.type !== customerType) {
    throw new APIError({ message: "customerType does not match the authenticated entity", status: httpStatus.BAD_REQUEST });
  }
  await sequelize.transaction(async transaction => {
    const [customer, created] = await ProviderCustomer.findOrCreate({
      defaults: {
        customerEntityId: entity.id,
        customerType,
        provider: "monerium",
        providerCustomerId: null,
        rail: "eur",
        status: VerificationStatus.Started,
        statusExternal: "authorization_started"
      },
      transaction,
      where: { customerEntityId: entity.id, customerType, provider: "monerium", rail: "eur" }
    });
    if (!created && !customer.providerCustomerId && customer.status !== VerificationStatus.Approved) {
      await customer.update({ status: VerificationStatus.Started, statusExternal: "authorization_started" }, { transaction });
    }
  });
  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(64));
  const transaction: OAuthTransaction = {
    customerEntityId: entity.id,
    customerType,
    expectedEmail: email.trim().toLowerCase(),
    redirectUri: config.monerium.redirectUri,
    userId,
    verifier
  };
  cache.set(stateCacheKey(state), transaction, OAUTH_TRANSACTION_TTL_SECONDS);

  const url = new URL("/auth", config.monerium.apiUrl);
  url.searchParams.set("client_id", config.monerium.clientId);
  url.searchParams.set("code_challenge", createPkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", transaction.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("email", email);
  return { authorizationUrl: url.toString() };
}

function consumeOAuthTransaction(state: string, userId: string, customerEntityId: string): OAuthTransaction {
  const key = stateCacheKey(state);
  const pending = cache.get<OAuthTransaction>(key);
  if (!pending) {
    throw new APIError({ message: "Invalid or expired OAuth state", status: httpStatus.BAD_REQUEST });
  }
  if (pending.userId !== userId || pending.customerEntityId !== customerEntityId) {
    throw new APIError({ message: "OAuth transaction does not belong to this user", status: httpStatus.FORBIDDEN });
  }
  const consumed = cache.take<OAuthTransaction>(key);
  if (!consumed) {
    throw new APIError({ message: "OAuth state has already been used", status: httpStatus.BAD_REQUEST });
  }
  return consumed;
}

export async function completeMoneriumOAuth(userId: string, code: string, state: string): Promise<MoneriumStatusResponse> {
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  const pending = consumeOAuthTransaction(state, userId, entity.id);
  if (entity.type !== pending.customerType) {
    throw new APIError({ message: "customerType does not match the authenticated entity", status: httpStatus.BAD_REQUEST });
  }
  const credentials = await requestToken(
    new URLSearchParams({
      client_id: config.monerium.clientId,
      code,
      code_verifier: pending.verifier,
      grant_type: "authorization_code",
      redirect_uri: pending.redirectUri
    })
  );
  const { context, profile } = await readProfile(credentials, pending.customerType);
  if (context.email.trim().toLowerCase() !== pending.expectedEmail) {
    throw new APIError({ message: "Monerium account does not match the authenticated user", status: httpStatus.CONFLICT });
  }
  const result = await mirrorProfile(entity.id, pending.customerType, profile);
  credentialCache.set(credentialsCacheKey(entity.id, pending.customerType), credentials);
  return result;
}

export async function getMoneriumStatus(userId: string, customerType: ProviderCustomerType): Promise<MoneriumStatusResponse> {
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  if (entity.type !== customerType) {
    throw new APIError({ message: "customerType does not match the authenticated entity", status: httpStatus.BAD_REQUEST });
  }
  if (!credentialCache.has(credentialsCacheKey(entity.id, customerType))) {
    const persisted = await ProviderCustomer.findOne({
      where: { customerEntityId: entity.id, customerType, provider: "monerium", rail: "eur" }
    });
    if (
      persisted?.providerCustomerId &&
      persisted.statusExternal &&
      (persisted.status === VerificationStatus.Approved || persisted.status === VerificationStatus.Rejected)
    ) {
      return {
        customerType,
        profileId: persisted.providerCustomerId,
        status: mapMoneriumProfileState(persisted.statusExternal),
        statusExternal: persisted.statusExternal
      };
    }
  }
  const credentials = await getValidCredentials(entity.id, customerType);
  const { profile } = await readProfile(credentials, customerType);
  return mirrorProfile(entity.id, customerType, profile);
}

export function resetMoneriumMemoryForTests(): void {
  credentialCache.flushAll();
  refreshes.clear();
}
