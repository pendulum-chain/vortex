import { BrlaApiError } from "@vortexfi/shared";

/**
 * Whether Avenia rejected the request outright rather than leaving its outcome unknown.
 *
 * A deterministic client rejection creates nothing on Avenia's side, so the durable claim that
 * guards the send can be released for a corrected retry. Timeouts (`408`), conflicts (`409`),
 * rate limits (`429`), transport failures (status `0`) and `5xx` may still have reached Avenia
 * and must stay ambiguous so no second send is issued against an attempt that already exists.
 *
 * Shared so every pre-send claim classifies provider failures the same way.
 */
export function isDeterministicProviderRejection(error: unknown): boolean {
  return error instanceof BrlaApiError && error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
}
