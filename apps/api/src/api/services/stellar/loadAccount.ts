import { Horizon } from "stellar-sdk";
import logger from "../../../config/logger";
import { HORIZON_URL } from "../../../constants/constants";

const horizonServer = new Horizon.Server(HORIZON_URL);

export async function loadAccountWithRetry(
  ephemeralAccountId: string,
  retries = 3,
  timeout = 15000
): Promise<Horizon.AccountResponse | null> {
  let lastError: Error | null = null;

  const loadAccountWithTimeout = (accountId: string, timeout: number): Promise<Horizon.AccountResponse> =>
    Promise.race([
      horizonServer.loadAccount(accountId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
    ]);

  for (let i = 0; i < retries; i++) {
    try {
      return await loadAccountWithTimeout(ephemeralAccountId, timeout);
    } catch (err: unknown) {
      if (err instanceof Error && err.toString().includes("NotFoundError")) {
        // The account does not exist
        return null;
      }
      logger.info(`Attempt ${i + 1} to load account ${ephemeralAccountId} failed: ${err}`);
      lastError = err as Error;
    }
  }

  throw new Error(`Failed to load account ${ephemeralAccountId} after ${retries} attempts: ${lastError?.toString()}`);
}
