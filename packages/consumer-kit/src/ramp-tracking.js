// Ramp start, polling and classification, lifted verbatim from Gold (apps/gold/src/lib/vortex.js)
// with its fixes: polling survives blips (abe8082a9), abandoned ramps stop blocking (46810a43e),
// the resumed Pix deadline is real (c6ed93b0a), the countdown follows the clock (dc0f8d22b) and a
// resumed sell reads its unsigned transactions (6a7b033fe).
import { VortexError } from "./vortex/api.js";

export const SUCCESS_STATUSES = Object.freeze(["completed", "complete", "success"]);
export const FAILURE_STATUSES = Object.freeze(["failed", "cancelled", "expired", "timedout", "timed_out"]);

// The API refuses to start a ramp 15 minutes after registration and only ever starts a paid Pix ramp
// later through its unhandled-payment worker (every 15 minutes). A ramp still initial an hour after
// registration is abandoned and must stop blocking new operations on this device.
export const ABANDONED_AFTER_MS = 60 * 60_000;
export const RAMP_START_WINDOW_MS = 15 * 60_000;

/** @returns {"success"|"failure"|"awaiting_payment"|"processing"} failure overrides completion */
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
  return ramp?.createdAt ? Date.parse(ramp.createdAt) + RAMP_START_WINDOW_MS : null;
}

export function secondsUntilExpiry(expiresAt, now = Date.now()) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

// No response, a timeout, rate limiting or a server error; auth and validation errors are final.
export function isTransientError(error) {
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
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, intervalMs);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  throw new VortexError("A operação continua em processamento. Você pode fechar esta tela e acompanhar depois.", { code: "POLL_TIMEOUT" });
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

// The SDK's status call omits unsignedTxs; resuming a sell needs them to ask the wallet again.
export async function getRampWithUnsignedTxs(session, rampId) {
  return session.authenticatedApi(`/v1/ramp/${encodeURIComponent(rampId)}?showUnsignedTxs=true`, { method: "GET" });
}
