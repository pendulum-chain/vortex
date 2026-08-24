import { EvmNetworks } from "@vortexfi/shared";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { EVM_FUNDING_PRIVATE_KEY } from "../../../../../config/vars";
import { abortableCall, throwIfAborted } from "./cancellation";

let cachedAccount: PrivateKeyAccount | undefined;
const operationTails = new Map<string, Promise<void>>();

export function getEvmFundingAccount(_network: EvmNetworks): PrivateKeyAccount {
  if (!EVM_FUNDING_PRIVATE_KEY) {
    throw new Error(
      "EVM_FUNDING_PRIVATE_KEY is not configured (and no MOONBEAM_EXECUTOR_PRIVATE_KEY fallback). Cannot derive EVM funding account."
    );
  }
  if (!cachedAccount) {
    cachedAccount = privateKeyToAccount(EVM_FUNDING_PRIVATE_KEY as `0x${string}`);
  }
  return cachedAccount;
}

/**
 * Serializes transactions from the shared EVM funding account within one API process.
 * Callers must include nonce selection through receipt confirmation in `operation`.
 * An aborted caller detaches without releasing the queue until the operation itself settles.
 */
export async function runSerializedEvmFundingOperation<Result>(
  network: EvmNetworks,
  operation: () => Promise<Result>,
  signal?: AbortSignal
): Promise<Result> {
  throwIfAborted(signal);
  const fundingAccount = getEvmFundingAccount(network);
  const key = `${network}:${fundingAccount.address.toLowerCase()}`;
  const previous = operationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  operationTails.set(key, tail);

  const completion = (async () => {
    await previous;
    try {
      throwIfAborted(signal);
      return await operation();
    } finally {
      release();
      if (operationTails.get(key) === tail) {
        operationTails.delete(key);
      }
    }
  })();

  return abortableCall(signal, () => completion);
}
