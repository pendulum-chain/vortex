import { storeEphemeralRampKeys } from "./ephemeral-store.js";
import { PAXG_ADDRESS, assertSellBalance, sendEthereumTransaction } from "./paxg.js";
import { saveActiveRamp, getActiveRamp, saveTransactionCheckpoint } from "./pilot-store.js";

const ENV = import.meta.env || {};
const API_BASE = (ENV.VITE_VORTEX_API_BASE_URL || "https://api.vortexfinance.co").replace(/\/$/, "");
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
  return api("/v1/auth/request-otp", { method: "POST", body: JSON.stringify({ email: String(email).trim().toLowerCase() }) });
}

export async function verifyVortexOtp(email, token) {
  const session = await api("/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: String(email).trim().toLowerCase(), token: String(token).replace(/\D/g, "") }) });
  return setVortexSession(session);
}

export async function refreshVortexSession() {
  if (refreshPromise) return refreshPromise;
  const session = getVortexSession();
  if (!session?.refresh_token) {
    clearVortexSession();
    throw new VortexError("Sua sessão de segurança expirou. Solicite um novo código.", { status: 401, code: "SESSION_EXPIRED" });
  }
  refreshPromise = api("/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) })
    .then(setVortexSession).catch((error) => { clearVortexSession(); throw error; }).finally(() => { refreshPromise = null; });
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

export async function getBrazilBuyReadiness(client) {
  const info = await client.getRampInfo();
  const entries = Object.entries(info?.corridors || {});
  const match = entries.find(([key]) => /^(BR|BRL|PIX|Brazil)$/i.test(key));
  return match ? { corridor: match[0], ...match[1] } : { corridor: null, kycStatus: "not_started", canBuy: false, canSell: false };
}

export async function submitWalletTransactions(client, rampId, unsignedTransactions, walletAddress, ethereumProvider) {
  if (!unsignedTransactions?.length) return;
  if (!ethereumProvider) throw new VortexError("A carteira Privy ainda não está pronta para confirmar a operação.", { code: "WALLET_NOT_READY" });
  await ethereumProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
  await client.submitUserTransactions(rampId, unsignedTransactions, { includeDomainType: true, signTypedData: async (payload) => {
    if (payload.domain?.chainId && BigInt(payload.domain.chainId) !== 1n) throw new Error("A confirmação não pertence à rede Ethereum.");
    return ethereumProvider.request({ method: "eth_signTypedData_v4", params: [walletAddress, JSON.stringify(payload)] });
  }, sendTransaction: async (transaction, context) => {
    const phase = context.unsignedTransaction.phase;
    const saved = getActiveRamp(walletAddress);
    const previousHash = saved?.rampId === rampId ? saved.transactions?.[phase] : null;
    return sendEthereumTransaction(ethereumProvider, walletAddress, transaction, { previousHash, onBroadcast: (hash) => saveTransactionCheckpoint(rampId, phase, hash) });
  } });
}

export async function registerPaxgBuy({ client, quote, walletAddress, ethereumProvider }) {
  if (!walletAddress) throw new VortexError("Sua carteira Privy ainda está sendo preparada. Aguarde alguns segundos.", { code: "WALLET_NOT_READY" });
  const { rampProcess, unsignedTransactions } = await client.registerRamp(quote.rawQuote || quote, { destinationAddress: walletAddress });
  await submitWalletTransactions(client, rampProcess.id, unsignedTransactions, walletAddress, ethereumProvider);
  return rampProcess;
}

export async function registerPaxgSell({ client, quote, walletAddress, ethereumProvider, pixDestination, onRegistered }) {
  await assertSellBalance(ethereumProvider, walletAddress, quote.inputAmount);
  const result = await client.registerRamp(quote.rawQuote || quote, { walletAddress, pixDestination: pixDestination.trim() });
  saveActiveRamp({ rampId: result.rampProcess.id, walletAddress, inputAmount: quote.inputAmount, outputAmount: quote.outputAmount, rampType: "SELL", stage: "signing" });
  onRegistered?.(result.rampProcess);
  await submitWalletTransactions(client, result.rampProcess.id, result.unsignedTransactions, walletAddress, ethereumProvider);
  return result.rampProcess;
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

export function classifyRamp(ramp) {
  const status = String(ramp?.status || "").toLowerCase();
  const phase = String(ramp?.currentPhase || "").toLowerCase();
  if (FAILURE_STATUSES.includes(status) || ["failed", "timedout"].includes(phase)) return "failure";
  if (SUCCESS_STATUSES.includes(status) || phase === "complete") return "success";
  if (ramp?.depositQrCode && phase === "initial") return "awaiting_payment";
  return "processing";
}

export async function pollRamp(client, rampId, { onUpdate, intervalMs = 4_000, timeoutMs = 20 * 60_000, signal } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ramp = await client.getRampStatus(rampId);
    onUpdate?.(ramp);
    const classification = classifyRamp(ramp);
    if (["success", "failure"].includes(classification)) {
      return ramp;
    }
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, intervalMs);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  throw new VortexError("A operação continua em processamento. Você pode fechar esta tela e acompanhar depois.", { code: "POLL_TIMEOUT" });
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

export async function submitBrazilKyc(payload) { return authenticatedApi("/v1/brl/newKyc", { method: "POST", body: JSON.stringify(payload) }); }
export async function getBrazilKycStatus(taxId) { return authenticatedApi(`/v1/brl/getKycStatus?taxId=${encodeURIComponent(taxId)}`, { method: "GET" }); }

export async function pollBrazilKyc(taxId, { onUpdate, intervalMs = 4_000, timeoutMs = 5 * 60_000, signal } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await getBrazilKycStatus(taxId);
    onUpdate?.(result);
    const status = String(result?.status || "").toUpperCase();
    const outcome = String(result?.result || "").toUpperCase();
    if (status === "COMPLETED" || ["APPROVED", "REJECTED"].includes(outcome)) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new VortexError("A verificação ainda está em análise. Você pode voltar ao painel e continuar mais tarde.", { code: "KYC_PENDING" });
}
