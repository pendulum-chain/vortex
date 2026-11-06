// Vortex API client, lifted from Gold (apps/gold/src/lib/vortex.js) and parametrised: the
// kit never reads Vite env variables, the app passes its config in.

export class VortexError extends Error {
  constructor(message, { status = 0, code = "VORTEX_ERROR", details = null } = {}) {
    super(message);
    this.name = "VortexError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Same-origin by default: the Vortex Netlify site proxies /api/<env>/* to the API, so a
// relative VITE_SIGNING_SERVICE_PATH (as the ramp frontend uses) needs no CORS entry.
export function resolveApiBase(value, origin) {
  return new URL(value || "/api/production", origin).href.replace(/\/$/, "");
}

const KYC_NEEDS_SUPPORT_PT = "Sua verificação precisa ser conferida pela Vortex. Consulte o suporte da Vortex.";
const KYC_ALREADY_APPROVED_PT = "Sua identidade já foi verificada. Feche esta tela e tente novamente.";

// The API's fixed English messages that the e-mail code and KYC steps can show through this client.
export const SERVER_MESSAGES_PT = Object.freeze({
  "Invalid OTP or OTP expired": "Código inválido ou expirado. Confira o código ou solicite um novo.",
  "A subaccount already exists for this taxId": "Este CPF já está ligado a outra conta Vortex. Entre com o e-mail dessa conta ou consulte o suporte da Vortex.",
  "This customer is already approved": KYC_ALREADY_APPROVED_PT,
  "The KYC case is already approved": KYC_ALREADY_APPROVED_PT,
  "This KYC case uses Sumsub token import": KYC_NEEDS_SUPPORT_PT,
  "Exactly one canonical KYC case is required": KYC_NEEDS_SUPPORT_PT,
  "The canonical subaccount differs from the confirmed creation result": KYC_NEEDS_SUPPORT_PT,
  "Subaccount not found": KYC_NEEDS_SUPPORT_PT,
  "Ramp disabled": KYC_NEEDS_SUPPORT_PT,
  "Individual KYC requires an individual customer account.": KYC_NEEDS_SUPPORT_PT,
  "taxIdNumber does not match the tax ID claimed for this subaccount.": "O CPF não confere com o informado no início da verificação. Confira o número e tente novamente.",
  "The provider rejected the KYC submission. Correct the submitted details and try again.": "A Avenia recusou os dados enviados. Corrija as informações e tente novamente.",
  "Invalid request": "Confira os dados informados e tente novamente.",
});

export function friendlyError(status, body) {
  const raw = body?.error?.message || body?.message || body?.error;
  if (status === 401) return "Sua sessão de segurança expirou. Solicite um novo código.";
  if (status === 403) return "Esta operação ainda não está autorizada para este acesso.";
  if (status < 500 && SERVER_MESSAGES_PT[raw]) return SERVER_MESSAGES_PT[raw];
  if (status === 409) return raw || "Esta etapa já foi concluída. Atualizamos o status para você.";
  if (status === 422 || status === 400) return raw || "Confira os dados informados e tente novamente.";
  if (status >= 500) return "A Vortex está temporariamente indisponível. Tente novamente em alguns minutos.";
  return raw || "A Vortex não conseguiu concluir esta etapa.";
}

function parseBody(response) { return response.status === 204 ? Promise.resolve(null) : response.json().catch(() => null); }

/**
 * @param {{apiBase:string, publicKey?:string, fetchImpl?:typeof fetch, timeoutMs?:number}} cfg
 * @returns {(path:string, options?:RequestInit, opts?:{token?:string, timeoutMs?:number}) => Promise<any>}
 */
export function createApi({ apiBase, publicKey = "", fetchImpl, timeoutMs: defaultTimeoutMs = 25_000 }) {
  if (!apiBase) throw new Error("createApi needs an apiBase.");
  return async function api(path, options = {}, { token, timeoutMs = defaultTimeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { ...(options.body instanceof Blob ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (publicKey) headers["X-Public-Key"] = publicKey;
      // Resolved per call, so tests (and the Gold test style) can swap globalThis.fetch.
      const response = await (fetchImpl ?? globalThis.fetch)(`${apiBase}${path}`, { ...options, headers, signal: options.signal || controller.signal });
      const body = await parseBody(response);
      if (!response.ok) throw new VortexError(friendlyError(response.status, body), { status: response.status, code: body?.error?.code || body?.code || `HTTP_${response.status}`, details: { requestId: response.headers.get("X-Request-ID") } });
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw new VortexError("A conexão demorou demais. Verifique sua internet e tente novamente.", { code: "TIMEOUT" });
      if (error instanceof VortexError) throw error;
      throw new VortexError("Não foi possível conectar à Vortex. Verifique sua internet e tente novamente.", { code: "NETWORK_ERROR" });
    } finally { clearTimeout(timer); }
  };
}
