// Brazilian (Avenia) KYC through the Vortex API, lifted from Gold (apps/gold/src/lib/vortex.js
// and the KycStep payload in App.jsx). KYC belongs to the Vortex user, not to an app: a user
// approved in Gold is approved in Stocks.
import { VortexError } from "./vortex/api.js";
import { isTransientError } from "./ramp-tracking.js";

/** @typedef {{kycStatus:"approved"|"pending"|"not_started", canBuy:boolean, canSell:boolean}} Readiness */

export const cleanCpf = (value) => String(value || "").replace(/\D/g, "").slice(0, 11);

export function isValidCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits) || digits === "01234567890") return false;
  const check = (length) => [...digits.slice(0, length)].reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0) * 10 % 11 % 10;
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export function kycOutcome(result) {
  if (String(result?.result || "").toUpperCase() === "APPROVED") return { approved: true, message: "" };
  if (String(result?.status || "").toUpperCase() === "EXPIRED") return { approved: false, message: "O prazo da verificação terminou. Envie o documento e faça a selfie novamente." };
  const reasons = { face: "A selfie não confirmou que o documento é seu. Faça a selfie novamente em um local bem iluminado.", name: "O nome informado não confere com o documento. Corrija e tente novamente.", birthdate: "A data de nascimento não confere com o documento. Corrija e tente novamente.", tax_id: "O CPF informado não foi encontrado. Confira o número e tente novamente." };
  return { approved: false, message: reasons[String(result?.failureReason || "").toLowerCase()] || "A verificação não foi aprovada. Confira seus dados e tente novamente." };
}

/**
 * Pure payload for POST /v1/brl/newKyc. Avenia expects alpha-3 country codes ("BRA"); Gold
 * built this inline in JSX (fix 31e9c02c3), here it is unit-tested.
 */
export function buildAveniaKycPayload({ form, uploads, subAccountId, email }) {
  return {
    subAccountId,
    fullName: form.fullName.trim(),
    dateOfBirth: form.dateOfBirth,
    countryOfTaxId: "BRA",
    taxIdNumber: cleanCpf(form.taxId),
    email,
    country: "BRA",
    state: form.state.toUpperCase(),
    city: form.city.trim(),
    zipCode: form.zipCode.replace(/\D/g, ""),
    streetAddress: form.streetAddress.trim(),
    uploadedSelfieId: uploads.selfieUpload.id,
    uploadedDocumentId: uploads.idUpload.id,
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * @param {{ session:ReturnType<typeof import("./vortex/session.js").createVortexSession>, fetchImpl?:typeof fetch }} deps
 */
export function createBrazilKyc({ session, fetchImpl }) {
  const authed = session.authenticatedApi;

  // The signed-in user's own Avenia account, read with the OTP session as the widget does before it
  // skips KYC, and with no CPF, which a returning user no longer has here. /v1/ramp-info cannot be used:
  // it only reports on the owner of an API credential. /v1/onboarding/status comes first because it
  // refreshes the provider's attempt, and that is what approves a review that ended while the user was
  // away; /v1/brl/getUser only passes once the account is approved here.
  /** @returns {Promise<Readiness>} */
  async function getReadiness() {
    let onboarding = null;
    let onboardingError = null;
    try { onboarding = await authed("/v1/onboarding/status", { method: "GET" }); }
    catch (error) { onboardingError = error; }
    try {
      const { identityStatus } = await authed("/v1/brl/getUser", { method: "GET" });
      const approved = identityStatus === "CONFIRMED";
      return { kycStatus: approved ? "approved" : "pending", canBuy: approved, canSell: approved };
    } catch (error) {
      // 400/404: no approved, provisioned Avenia account yet.
      if (error.status !== 400 && error.status !== 404) throw error;
      // Not knowing is not "not started": the form would only resubmit over a review in flight.
      if (onboardingError) throw onboardingError;
      const account = onboarding?.entities?.flatMap((entity) => entity.accounts).find((item) => item.provider === "avenia" && item.customerType === "individual");
      // The provider's attempt is what is in review. status and submittedAt cannot tell: creating the
      // subaccount already sets them, before any document is sent.
      const inReview = ["pending", "in_review"].includes(account?.kycCase?.status) && ["PENDING", "PROCESSING"].includes(account?.kycCase?.statusExternal);
      return { kycStatus: inReview ? "pending" : "not_started", canBuy: false, canSell: false };
    }
  }

  const createSubaccount = ({ name, taxId, quoteId, sessionId }) =>
    authed("/v1/brl/createSubaccount", { method: "POST", body: JSON.stringify({ accountType: "INDIVIDUAL", name, taxId, quoteId, sessionId }) });

  const getUploadUrls = ({ taxId, documentType, isDoubleSided }) =>
    authed("/v1/brl/getUploadUrls", { method: "POST", body: JSON.stringify({ taxId, documentType, isDoubleSided }) });

  // Presigned upload URL: unauthenticated on purpose.
  async function uploadDocument(uploadUrl, file) {
    const response = await (fetchImpl ?? globalThis.fetch)(uploadUrl, { method: "PUT", body: file, headers: file.type ? { "Content-Type": file.type } : {} });
    if (!response.ok) throw new VortexError("Não foi possível enviar a foto do documento. Tente novamente.", { status: response.status, code: "DOCUMENT_UPLOAD_FAILED" });
  }

  async function submit(payload) {
    try { return await authed("/v1/brl/newKyc", { method: "POST", body: JSON.stringify(payload) }); }
    catch (error) {
      if (error.status === 409) throw new VortexError("Não foi possível abrir uma nova verificação automaticamente. Consulte o suporte da Vortex.", { status: 409, code: "KYC_NEW_ATTEMPT_BLOCKED", details: error.details });
      // The same payload would be refused again: the user has to correct it on the form.
      if (error.status === 400) throw new VortexError(error.message, { status: 400, code: "KYC_SUBMISSION_REFUSED", details: error.details });
      throw error;
    }
  }
  const getStatus = (taxId) => authed(`/v1/brl/getKycStatus?taxId=${encodeURIComponent(taxId)}`, { method: "GET" });

  async function poll(taxId, { onUpdate, intervalMs = 4_000, timeoutMs = 5 * 60_000, maxConsecutiveErrors = 5, signal } = {}) {
    const startedAt = Date.now();
    let failures = 0;
    while (Date.now() - startedAt < timeoutMs) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      let result;
      try { result = await getStatus(taxId); failures = 0; }
      catch (error) {
        const reconciling = [404, 409].includes(error.status);
        if (!(isTransientError(error) || reconciling)) throw error;
        if (++failures >= maxConsecutiveErrors) {
          if (!reconciling) throw error;
          throw new VortexError("Não conseguimos confirmar sua verificação agora. Aguarde alguns minutos e tente novamente; se continuar, consulte o suporte da Vortex.", { status: error.status, code: "KYC_STATUS_UNAVAILABLE" });
        }
      }
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (result) {
        onUpdate?.(result);
        const status = String(result?.status || "").toUpperCase();
        const outcome = String(result?.result || "").toUpperCase();
        if (["COMPLETED", "EXPIRED"].includes(status) || ["APPROVED", "REJECTED"].includes(outcome)) return result;
      }
      // Unlike Gold's loop, closing the flow aborts the wait instead of polling on in the background.
      await sleep(intervalMs, signal);
    }
    throw new VortexError("A verificação ainda está em análise. Você pode voltar ao painel e continuar mais tarde.", { code: "KYC_PENDING" });
  }

  return { getReadiness, createSubaccount, getUploadUrls, uploadDocument, submit, getStatus, poll };
}
