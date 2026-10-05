import logger from "../../config/logger";
import { ProviderInternalError } from "../errors/providerErrors";
import { fetchWithTimeout } from "./fetchWithTimeout";

/**
 * Fetches a price provider's JSON endpoint. Network failures and unparsable bodies surface as a
 * ProviderInternalError (HTTP status handling is left to the caller, which needs the `Response`).
 *
 * @param describeError builds the ProviderInternalError message from the underlying failure
 */
export async function fetchProviderJson<T>(
  provider: string,
  url: string,
  init?: RequestInit,
  describeError: (error: unknown) => string = error =>
    `Network error fetching price from ${provider}: ${(error as Error).message}`
): Promise<{ response: Response; body: T }> {
  try {
    const response = await fetchWithTimeout(url, init);
    return { body: (await response.json()) as T, response };
  } catch (error) {
    logger.error(`${provider} fetch error:`, error);
    throw new ProviderInternalError(describeError(error));
  }
}
