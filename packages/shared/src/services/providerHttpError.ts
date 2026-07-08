/**
 * Base class for errors raised when a fiat provider (Avenia/BRLA, Alfredpay) HTTP request
 * fails — either a non-ok response or a transport failure (DNS/timeout/connection reset).
 *
 * Carries the failing `endpoint`, `method`, upstream `status` (0 for transport failures with
 * no HTTP response), and raw `responseBody` so callers can log exactly which provider call
 * failed and map it to a sanitized caller-facing error without forwarding the raw upstream body.
 *
 * Named `ProviderHttpError` to avoid colliding with the price-layer `ProviderApiError` in
 * `apps/api/src/api/errors/providerErrors.ts`.
 *
 * The `message` shape is intentionally identical to the plain Error these services threw
 * before (`Request failed with status '<code>'. Error: <body>`): existing consumers parse it
 * — `handleApiError` in the BRLA controller matches `status '<code>'` and splits on `Error: `,
 * and the Alfredpay controller matches substrings like `"404"`/`"409"` in the message. Do not
 * change the shape without updating those consumers.
 */
export class ProviderHttpError extends Error {
  public readonly provider: string;

  public readonly status: number;

  public readonly endpoint: string;

  public readonly method: string;

  public readonly responseBody: string;

  constructor(params: { provider: string; status: number; endpoint: string; method: string; responseBody: string }) {
    super(`Request failed with status '${params.status}'. Error: ${params.responseBody}`);
    this.name = this.constructor.name;
    // Restore the prototype chain so `instanceof ProviderHttpError` (and the subclasses) stays
    // reliable after transpilation/bundling — mapProviderFailure depends on it. Matches the
    // convention in apps/api/src/api/errors/providerErrors.ts and services/xcm/send.ts.
    Object.setPrototypeOf(this, new.target.prototype);
    this.provider = params.provider;
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.method = params.method;
    this.responseBody = params.responseBody;
  }
}
