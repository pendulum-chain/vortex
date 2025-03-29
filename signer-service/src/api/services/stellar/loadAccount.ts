import { Horizon } from 'stellar-sdk';
import { HORIZON_URL } from '../../../constants/constants';

const horizonServer = new Horizon.Server(HORIZON_URL);

export async function loadAccountWithRetry(
  ephemeralAccountId: string,
  retries = 3,
  timeout = 15000,
): Promise<Horizon.AccountResponse | null> {
  let lastError: Error | null = null;

  const loadAccountWithTimeout = (accountId: string, timeout: number): Promise<Horizon.AccountResponse> => Promise.race([
      horizonServer.loadAccount(accountId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

  for (let i = 0; i < retries; i++) {
    try {
      return await loadAccountWithTimeout(ephemeralAccountId, timeout);
    } catch (err: any) {
      if (err?.toString().includes('NotFoundError')) {
        // The account does not exist
        return null;
      }
      console.log(`Attempt ${i + 1} to load account ${ephemeralAccountId} failed: ${err}`);
      lastError = err;
    }
  }

  throw new Error(`Failed to load account ${ephemeralAccountId} after ${retries} attempts: ${  lastError?.toString()}`);
}
