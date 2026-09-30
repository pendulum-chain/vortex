import { storeEphemeralRampKeys } from "./ephemeral-store.js";
import { PAXG_ADDRESS, assertPaxgSellTransactions, assertSellBalance, sendEthereumTransaction } from "./paxg.js";
import { failActiveRamp, saveActiveRamp, getActiveRamp, saveTransactionCheckpoint } from "./pilot-store.js";

const ENV = import.meta.env || {};
// Same-origin by default: the Vortex Netlify site proxies /api/<env>/* to the API, so a
// relative VITE_SIGNING_SERVICE_PATH (as the ramp frontend uses) needs no CORS entry.
export function resolveApiBase(value, origin) {
  return new URL(value || "/api/production", origin).href.replace(/\/$/, "");
}
const API_BASE = resolveApiBase(ENV.VITE_SIGNING_SERVICE_PATH, globalThis.location?.origin ?? "http://localhost");
const PUBLIC_KEY = ENV.VITE_VORTEX_PUBLIC_KEY || "";
const ACCESS_KEY = "satoshi:vortex-session:v2";
const REQUEST_TIMEOUT_MS = 25_000;
let refreshPromise = null;

export class VortexError extends Error {
  constructor(message, { status = 0, code = "VORTEX_ERROR", details = null } = {}) {
    super(message);
    this.name = "VortexError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function storage() { return typeof window === "undefined" ? null : window.sessionStorage; }
function parseBody(response) { return response.status === 204 ? Promise.resolve(null) : response.json().catch(() => null); }

function friendlyError(status, body) {
  const raw = body?.error?.message || body?.message || body?.error;
  if (status === 401) return "Sua sessão de segurança expirou. Solicite um novo código.";
  if (status === 403) return "Esta operação ainda não está autorizada para este acesso.";
  if (status === 409) return raw || "Esta etapa já foi concluída. Atualizamos o status para você.";
  if (status === 422 || status === 400) return raw || "Confira os dados informados e tente novamente.";
  if (status >= 500) return "A Vortex está temporariamente indisponível. Tente novamente em alguns minutos.";
  return raw || "A Vortex não conseguiu concluir esta etapa.";
}

async function api(path, options = {}, { token, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...(options.body instanceof Blob ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (PUBLIC_KEY) headers["X-Public-Key"] = PUBLIC_KEY;
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: options.signal || controller.signal });
    const body = await parseBody(response);
    if (!response.ok) throw new VortexError(friendlyError(response.status, body), { status: response.status, code: body?.error?.code || body?.code || `HTTP_${response.status}`, details: { requestId: response.headers.get("X-Request-ID") } });
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new VortexError("A conexão demorou demais. Verifique sua internet e tente novamente.", { code: "TIMEOUT" });
    if (error instanceof VortexError) throw error;
    throw new VortexError("Não foi possível conectar à Vortex. Verifique sua internet e tente novamente.", { code: "NETWORK_ERROR" });
  } finally { clearTimeout(timer); }
}

function normalizeSession(value) {
  if (!value) return null;
  const accessToken = value.access_token || value.accessToken;
  const refreshToken = value.refresh_token || value.refreshToken;
  if (!accessToken) return null;
  return { ...value, access_token: accessToken, refresh_token: refreshToken };
}

function jwtExpiresAt(token) {
  try {
    const encoded = token.split(".")[1];
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    return Number(JSON.parse(json).exp || 0) * 1000;
  } catch { return 0; }
}

export function getVortexSession() {
  try { return normalizeSession(JSON.parse(storage()?.getItem(ACCESS_KEY) || "null")); } catch { return null; }
}

export function setVortexSession(value) {
  const session = normalizeSession(value);
  if (!session) throw new VortexError("A resposta de login da Vortex não contém uma sessão válida.", { code: "INVALID_SESSION" });
  storage()?.setItem(ACCESS_KEY, JSON.stringify(session));
  return session;
}

export function clearVortexSession() { storage()?.removeItem(ACCESS_KEY); }

export async function requestVortexOtp(email) {
  // Without a locale the API sends the English e-mail and resets the user's stored locale to en-US.
  return api("/v1/auth/request-otp", { method: "POST", body: JSON.stringify({ email: String(email).trim().toLowerCase(), locale: "pt-BR" }) });
}

export async function verifyVortexOtp(email, token) {
  const verifiedEmail = String(email).trim().toLowerCase();
  const session = await api("/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: verifiedEmail, token: String(token).replace(/\D/g, "") }) });
  // Kept with the session, like the widget's stored user e-mail, so it is only reused for that address.
  return setVortexSession({ ...session, email: verifiedEmail });
}

// A session verified in this tab for the same e-mail skips the code step; a rejected one falls back to it.
export function hasVortexSession(email) {
  return getVortexSession()?.email === String(email || "").trim().toLowerCase();
}

export async function refreshVortexSession() {
  if (refreshPromise) return refreshPromise;
  const session = getVortexSession();
  if (!session?.refresh_token) {
    clearVortexSession();
    throw new VortexError("Sua sessão de segurança expirou. Solicite um novo código.", { status: 401, code: "SESSION_EXPIRED" });
  }
  // Only a 401 means the refresh token is invalid (security spec, Supabase OTP rule 9); a network
  // error or a 503 must keep the session so the user is not logged out mid-operation.
  refreshPromise = api("/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) })
    .then((next) => setVortexSession({ ...next, email: session.email })).catch((error) => { if (error.status === 401) clearVortexSession(); throw error; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function getFreshAccessToken() {
  const session = getVortexSession();
  if (!session) return null;
  const expiresAt = jwtExpiresAt(session.access_token);
  if (expiresAt && expiresAt <= Date.now() + 60_000) return (await refreshVortexSession()).access_token;
  return session.access_token;
}

async function authenticatedApi(path, options = {}) {
  const token = await getFreshAccessToken();
  if (!token) throw new VortexError("Confirme seu e-mail com o código antes de continuar.", { status: 401, code: "AUTH_REQUIRED" });
  try { return await api(path, options, { token }); }
  catch (error) {
    if (error.status !== 401 || !getVortexSession()?.refresh_token) throw error;
    const refreshed = await refreshVortexSession();
    return api(path, options, { token: refreshed.access_token });
  }
}

export async function createVortexClient(recovery) {
  const { VortexSdk } = await import("@vortexfi/sdk");
  return new VortexSdk({ apiBaseUrl: API_BASE, publicKey: PUBLIC_KEY || undefined, accessTokenProvider: getFreshAccessToken, storeEphemeralKeysCallback: async (keys, rampId) => {
    if (recovery?.walletAddress) saveActiveRamp({ ...recovery, rampId, stage: "registering" });
    await storeEphemeralRampKeys(keys, rampId);
  } });
}

export async function getPaxgAvailability() {
  const response = await api("/v1/supported-cryptocurrencies?network=ethereum", { method: "GET" });
  const tokens = Array.isArray(response) ? response : response.tokens || response.cryptocurrencies || [];
  const token = tokens.find((item) => item.assetSymbol === "PAXG" && item.assetNetwork === "ethereum" && item.assetContractAddress?.toLowerCase() === PAXG_ADDRESS.toLowerCase() && item.assetDecimals === 18);
  return { buy: token?.rampTypes?.includes("BUY") === true, sell: token?.rampTypes?.includes("SELL") === true };
}

export function buildPaxgBuyRequest(amount) {
  return { rampType: "BUY", from: "pix", to: "ethereum", inputAmount: String(amount), inputCurrency: "BRL", outputCurrency: "PAXG", paymentMethod: "pix", countryCode: "BR", network: "ethereum" };
}

export function buildPaxgSellRequest(amount) {
  return { rampType: "SELL", from: "ethereum", to: "pix", inputAmount: String(amount), inputCurrency: "PAXG", outputCurrency: "BRL", paymentMethod: "pix", countryCode: "BR", network: "ethereum" };
}

export function normalizeQuote(quote) {
  const outputPaxg = Number(quote.outputAmount || 0);
  return { ...quote, rawQuote: quote, outputPaxg, grams: Number(quote.rampType === "SELL" ? quote.inputAmount : outputPaxg) * 31.1034768, networkFee: Number(quote.networkFeeFiat || 0), serviceFee: Number(quote.processingFeeFiat || 0) + Number(quote.partnerFeeFiat || 0), totalFee: Number(quote.totalFeeFiat || 0), expiresAt: new Date(quote.expiresAt).getTime() };
}

export function validatePaxgQuote(quote, direction) {
  const buy = direction === "BUY";
  if (quote.rampType !== direction || quote.inputCurrency !== (buy ? "BRL" : "PAXG") || quote.outputCurrency !== (buy ? "PAXG" : "BRL") || quote.network !== "ethereum" || quote.from !== (buy ? "pix" : "ethereum") || quote.to !== (buy ? "ethereum" : "pix")) throw new VortexError("A cotação não corresponde à operação solicitada.", { code: "WRONG_ROUTE" });
  if (!quote.id || !Number.isFinite(Number(quote.outputAmount)) || Number(quote.outputAmount) <= 0 || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) throw new VortexError("A cotação não está disponível. Tente novamente.", { code: "INVALID_QUOTE" });
  for (const field of ["networkFeeFiat", "processingFeeFiat", "partnerFeeFiat", "totalFeeFiat"]) if (quote[field] == null || !Number.isFinite(Number(quote[field])) || Number(quote[field]) < 0) throw new VortexError("Não foi possível confirmar as taxas. Atualize a cotação.", { code: "INVALID_FEES" });
  if (quote.feeCurrency !== "BRL") throw new VortexError("As taxas não estão em reais.", { code: "INVALID_FEES" });
}

export async function createPaxgQuote(amount, walletAddress) {
  const client = await createVortexClient({ walletAddress, inputAmount: amount, rampType: "BUY" });
  const quote = await client.createQuote(buildPaxgBuyRequest(amount));
  validatePaxgQuote(quote, "BUY");
  return { client, quote: normalizeQuote(quote) };
}

export async function createPaxgSellQuote(amount, walletAddress) {
  const client = await createVortexClient({ walletAddress, inputAmount: amount, rampType: "SELL" });
  const quote = await client.createQuote(buildPaxgSellRequest(amount));
  validatePaxgQuote(quote, "SELL");
  return { client, quote: normalizeQuote(quote) };
}

// Reads the signed-in user's own Avenia account with the OTP session, as the widget does before it
// skips KYC. /v1/ramp-info cannot be used: it only reports on the owner of an API credential.
export async function getBrazilBuyReadiness() {
  try {
    const { identityStatus } = await authenticatedApi("/v1/brl/getUser", { method: "GET" });
    const approved = identityStatus === "CONFIRMED";
    return { kycStatus: approved ? "approved" : "pending", canBuy: approved, canSell: approved };
  } catch (error) {
    // 400/404: the user has no approved, provisioned Avenia account yet.
    if (error.status === 400 || error.status === 404) return { kycStatus: "not_started", canBuy: false, canSell: false };
    throw error;
  }
}

// The API refuses to record or start a ramp after its start deadline, so a transaction broadcast later
// would strand the gold. The margin covers the swap receipt wait (up to 3 minutes), the update and the start.
const SIGNING_MARGIN_MS = 4 * 60_000;

// inputAmount is the PAXG amount this device quoted, never the API's, and bounds the approval.
export async function submitWalletTransactions(client, ramp, unsignedTransactions, walletAddress, ethereumProvider, inputAmount) {
  if (!unsignedTransactions?.length) return;
  assertPaxgSellTransactions(unsignedTransactions, { walletAddress, inputAmount });
  if (!ethereumProvider) throw new VortexError("A carteira Privy ainda não está pronta para confirmar a operação.", { code: "WALLET_NOT_READY" });
  const deadline = rampStartDeadline(ramp);
  await ethereumProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
  await client.submitUserTransactions(ramp.id, unsignedTransactions, { sendTransaction: async (transaction, context) => {
    const phase = context.unsignedTransaction.phase;
    const saved = getActiveRamp(walletAddress);
    const previousHash = saved?.rampId === ramp.id ? saved.transactions?.[phase] : null;
    if (!previousHash && !(deadline - Date.now() > SIGNING_MARGIN_MS)) {
      // Nothing has left the wallet yet, so the dead ramp must stop blocking a new sale.
      failActiveRamp(ramp.id);
      throw new VortexError("O prazo desta venda terminou antes do envio do seu ouro. Seu ouro continua na carteira; faça uma nova venda.", { code: "START_WINDOW_CLOSED" });
    }
    return sendEthereumTransaction(ethereumProvider, walletAddress, transaction, { previousHash, onBroadcast: (hash) => saveTransactionCheckpoint(ramp.id, phase, hash) });
  } });
}

export async function registerPaxgBuy({ client, quote, walletAddress, ethereumProvider }) {
  if (!walletAddress) throw new VortexError("Sua carteira Privy ainda está sendo preparada. Aguarde alguns segundos.", { code: "WALLET_NOT_READY" });
  const { rampProcess, unsignedTransactions } = await client.registerRamp(quote.rawQuote || quote, { destinationAddress: walletAddress });
  await submitWalletTransactions(client, rampProcess, unsignedTransactions, walletAddress, ethereumProvider);
  return rampProcess;
}

export async function registerPaxgSell({ client, quote, walletAddress, ethereumProvider, pixDestination, onRegistered }) {
  await assertSellBalance(ethereumProvider, walletAddress, quote.inputAmount);
  const result = await client.registerRamp(quote.rawQuote || quote, { walletAddress, pixDestination: pixDestination.trim() });
  saveActiveRamp({ rampId: result.rampProcess.id, walletAddress, inputAmount: quote.inputAmount, outputAmount: quote.outputAmount, rampType: "SELL", stage: "signing" });
  onRegistered?.(result.rampProcess);
  await submitWalletTransactions(client, result.rampProcess, result.unsignedTransactions, walletAddress, ethereumProvider, quote.inputAmount);
  return result.rampProcess;
}

// The SDK's status call omits unsignedTxs; resuming a sell needs them to ask the wallet again.
export async function getRampWithUnsignedTxs(rampId) {
  return authenticatedApi(`/v1/ramp/${encodeURIComponent(rampId)}?showUnsignedTxs=true`, { method: "GET" });
}

export async function startRampSafely(client, rampId) {
  try { return await client.startRamp(rampId); }
  catch (error) {
    try {
      const current = await client.getRampStatus(rampId);
      if (current && classifyRamp(current) !== "failure" && String(current.currentPhase || "initial") !== "initial") return current;
    } catch { /* Preserve the original start error. */ }
    throw error;
  }
}

export const SUCCESS_STATUSES = ["completed", "complete", "success"];
export const FAILURE_STATUSES = ["failed", "cancelled", "expired", "timedout", "timed_out"];

// The API refuses to start a ramp 15 minutes after registration and only ever starts a paid PIX ramp
// later through its unhandled-payment worker (every 15 minutes). A ramp still initial an hour after
// registration is abandoned and must stop blocking new operations on this device.
const ABANDONED_AFTER_MS = 60 * 60_000;

export function classifyRamp(ramp, now = Date.now()) {
  const status = String(ramp?.status || "").toLowerCase();
  const phase = String(ramp?.currentPhase || "").toLowerCase();
  if (FAILURE_STATUSES.includes(status) || ["failed", "timedout"].includes(phase)) return "failure";
  if (SUCCESS_STATUSES.includes(status) || phase === "complete") return "success";
  if (phase === "initial" && Date.parse(ramp?.createdAt) + ABANDONED_AFTER_MS < now) return "failure";
  if (ramp?.depositQrCode && phase === "initial") return "awaiting_payment";
  return "processing";
}

// Status responses carry createdAt but no expiresAt; start is refused 15 minutes after registration.
export function rampStartDeadline(ramp) {
  if (ramp?.expiresAt) return new Date(ramp.expiresAt).getTime();
  return ramp?.createdAt ? Date.parse(ramp.createdAt) + 15 * 60_000 : null;
}

export function secondsUntilExpiry(expiresAt, now = Date.now()) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// No response, a timeout, rate limiting or a server error; auth and validation errors are final.
function isTransientError(error) {
  const status = Number(error?.status || 0);
  return [0, 408, 425, 429].includes(status) || status >= 500;
}

export async function pollRamp(client, rampId, { onUpdate, intervalMs = 4_000, timeoutMs = 20 * 60_000, maxConsecutiveErrors = 5, signal } = {}) {
  const startedAt = Date.now();
  let failures = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let ramp = null;
    // A mobile network blip must not end the tracking of a ramp that keeps running server-side.
    try { ramp = await client.getRampStatus(rampId); failures = 0; }
    catch (error) { if (!isTransientError(error) || ++failures >= maxConsecutiveErrors) throw error; }
    if (ramp) {
      onUpdate?.(ramp);
      if (["success", "failure"].includes(classifyRamp(ramp))) return ramp;
    }
    await delay(intervalMs, signal);
  }
  throw new VortexError("A operação continua em processamento. Você pode fechar esta tela e acompanhar depois.", { code: "POLL_TIMEOUT" });
}

// Brazilian CPF check digits, so a typo is caught here instead of by the API or Avenia.
export function isValidCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length) => [...digits.slice(0, length)].reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0) * 10 % 11 % 10;
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

export async function createBrazilSubaccount({ name, taxId, quoteId, sessionId }) {
  return authenticatedApi("/v1/brl/createSubaccount", { method: "POST", body: JSON.stringify({ accountType: "INDIVIDUAL", name, taxId, quoteId, sessionId }) });
}

export async function getBrazilKycUploads({ taxId, documentType, isDoubleSided }) {
  return authenticatedApi("/v1/brl/getUploadUrls", { method: "POST", body: JSON.stringify({ taxId, documentType, isDoubleSided }) });
}

export async function uploadKycDocument(uploadUrl, file) {
  const response = await fetch(uploadUrl, { method: "PUT", body: file, headers: file.type ? { "Content-Type": file.type } : {} });
  if (!response.ok) throw new VortexError("Não foi possível enviar a foto do documento. Tente novamente.", { status: response.status, code: "DOCUMENT_UPLOAD_FAILED" });
}

export async function submitBrazilKyc(payload) {
  try { return await authenticatedApi("/v1/brl/newKyc", { method: "POST", body: JSON.stringify(payload) }); }
  catch (error) {
    // Avenia only allows a new attempt after a rejection or expiry it marks retryable; otherwise the API
    // refuses the new documents with 409, and only support can reopen the verification.
    if (error.status !== 409) throw error;
    const reference = error.details?.requestId ? ` informando o código ${error.details.requestId}` : "";
    throw new VortexError(`Não foi possível abrir uma nova verificação automaticamente. Consulte o suporte da Vortex${reference}.`, { status: 409, code: "KYC_NEW_ATTEMPT_BLOCKED", details: error.details });
  }
}
export async function getBrazilKycStatus(taxId) { return authenticatedApi(`/v1/brl/getKycStatus?taxId=${encodeURIComponent(taxId)}`, { method: "GET" }); }

export async function pollBrazilKyc(taxId, { onUpdate, intervalMs = 4_000, timeoutMs = 5 * 60_000, maxConsecutiveErrors = 5, signal } = {}) {
  const startedAt = Date.now();
  let failures = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let result = null;
    // Besides network blips, the API answers 404 until a just-submitted attempt is visible and 409 while a
    // submission is reconciled; a 409 that persists needs an operator, so it ends in a support message.
    try { result = await getBrazilKycStatus(taxId); failures = 0; }
    catch (error) {
      const reconciling = [404, 409].includes(error.status);
      if (!(isTransientError(error) || reconciling)) throw error;
      if (++failures >= maxConsecutiveErrors) {
        if (!reconciling) throw error;
        throw new VortexError("Não conseguimos confirmar sua verificação agora. Aguarde alguns minutos e tente novamente; se continuar, consulte o suporte da Vortex.", { status: error.status, code: "KYC_STATUS_UNAVAILABLE", details: error.details });
      }
    }
    // An answer that arrives after the modal closed must not approve a flow that is gone.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (result) {
      onUpdate?.(result);
      const status = String(result.status || "").toUpperCase();
      const outcome = String(result.result || "").toUpperCase();
      if (["COMPLETED", "EXPIRED"].includes(status) || ["APPROVED", "REJECTED"].includes(outcome)) return result;
    }
    await delay(intervalMs, signal);
  }
  throw new VortexError("A verificação ainda está em análise. Aguarde nesta tela e toque em \"Já concluí a selfie\" para consultar de novo.", { code: "KYC_PENDING" });
}

const KYC_REJECTION_MESSAGES = {
  face: "A selfie não confirmou que o documento é seu. Tente de novo com boa luz, sem óculos nem boné.",
  name: "O nome informado não confere com o documento. Corrija e tente novamente.",
  birthdate: "A data de nascimento não confere com o documento. Corrija e tente novamente.",
  tax_id: "O CPF informado não confere com o documento. Corrija e tente novamente.",
};

// Maps a finished Avenia attempt to what the user must do next; expired and rejected attempts start over.
export function kycOutcome(result) {
  if (String(result?.result || "").toUpperCase() === "APPROVED") return { approved: true, message: "" };
  if (String(result?.status || "").toUpperCase() === "EXPIRED") return { approved: false, message: "O prazo da verificação terminou. Envie o documento e faça a selfie novamente." };
  return { approved: false, message: KYC_REJECTION_MESSAGES[String(result?.failureReason || "").toLowerCase()] || "A verificação não foi aprovada. Confira seus dados e tente novamente." };
}
