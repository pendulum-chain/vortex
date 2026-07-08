/**
 * Base class for errors raised when a fiat provider (Avenia/BRLA, Alfredpay) HTTP request
 * returns a non-ok response.
 *
 * Carries the failing `endpoint`, `method`, upstream `status`, and raw `responseBody` so
 * callers can log exactly which provider call failed and map it to a sanitized caller-facing
 * error without forwarding the raw upstream body.
 *
 * The `message` shape is intentionally identical to the plain Error these services threw
 * before (`Request failed with status '<code>'. Error: <body>`): existing consumers parse it
 * — `handleApiError` in the BRLA controller matches `status '<code>'` and splits on `Error: `,
 * and the Alfredpay controller matches substrings like `"404"`/`"409"` in the message. Do not
 * change the shape without updating those consumers.
 */
export class ProviderApiError extends Error {
  public readonly provider: string;

  public readonly status: number;

  public readonly endpoint: string;

  public readonly method: string;

  public readonly responseBody: string;

  constructor(params: { provider: string; status: number; endpoint: string; method: string; responseBody: string }) {
    super(`Request failed with status '${params.status}'. Error: ${params.responseBody}`);
    this.name = new.target.name;
    this.provider = params.provider;
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.method = params.method;
    this.responseBody = params.responseBody;
  }
}
