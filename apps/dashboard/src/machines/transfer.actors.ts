import {
  type AccountMeta,
  ApiManager,
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  EphemeralAccountType,
  type GetRampStatusResponse,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  Networks,
  type PresignedTx,
  type QuoteResponse,
  type RampProcess,
  type RegisterRampRequest,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import { isTerminalPhase, RampService } from "@/services/api/ramp.service";
import { signAndSubmitEvmTransaction, signMultipleTypedData } from "@/services/transactions/userSigning";

const ALCHEMY_API_KEY: string | undefined = import.meta.env.VITE_ALCHEMY_API_KEY;

export interface RegisterTransferInput {
  quote: QuoteResponse;
  additionalData: RegisterRampRequest["additionalData"] & { walletAddress: string };
}

export interface RegisterTransferOutput {
  ramp: RampProcess;
  userTxs: UnsignedTx[];
}

/**
 * Ported from the widget's register.actor: registers the ramp with fresh ephemeral
 * signing accounts, presigns the ephemeral-owned transactions client-side, and submits
 * them via /ramp/update. Returns the updated ramp plus the transactions the user's
 * connected wallet still has to sign.
 */
export async function registerTransfer(input: RegisterTransferInput): Promise<RegisterTransferOutput> {
  const { quote, additionalData } = input;
  const walletAddress = additionalData.walletAddress.toLowerCase();

  const substrateEphemeral = await createPendulumEphemeral();
  const evmEphemeral = createMoonbeamEphemeral();
  const signingAccounts: AccountMeta[] = [
    { address: evmEphemeral.address, type: EphemeralAccountType.EVM },
    { address: substrateEphemeral.address, type: EphemeralAccountType.Substrate }
  ];

  const rampProcess = await RampService.registerRamp(quote.id, signingAccounts, additionalData);

  // The dashboard wallet is EVM-only, so every transaction not signed by the connected
  // address belongs to an ephemeral (substrate signers can never match).
  const ephemeralTxs = (rampProcess.unsignedTxs ?? []).filter(tx => tx.signer.toLowerCase() !== walletAddress);

  const apiManager = ApiManager.getInstance();
  const pendulumApiComponents = ephemeralTxs.some(tx => tx.network === Networks.Pendulum)
    ? await apiManager.getApi(Networks.Pendulum)
    : undefined;
  const moonbeamApiComponents = ephemeralTxs.some(
    tx =>
      tx.network === Networks.Moonbeam &&
      !isEvmTransactionData(tx.txData) &&
      !isSignedTypedData(tx.txData) &&
      !isSignedTypedDataArray(tx.txData)
  )
    ? await apiManager.getApi(Networks.Moonbeam)
    : undefined;
  const hydrationApiComponents = ephemeralTxs.some(tx => tx.network === Networks.Hydration)
    ? await apiManager.getApi(Networks.Hydration)
    : undefined;

  const signedTransactions = await signUnsignedTransactions(
    ephemeralTxs,
    { evmEphemeral, substrateEphemeral },
    pendulumApiComponents?.api,
    moonbeamApiComponents?.api,
    hydrationApiComponents?.api,
    ALCHEMY_API_KEY
  );

  const updatedRamp = await RampService.updateRamp(rampProcess.id, signedTransactions);
  const userTxs = (updatedRamp.unsignedTxs ?? []).filter(tx => tx.signer.toLowerCase() === walletAddress);

  return { ramp: updatedRamp, userTxs };
}

export class UserRejectedError extends Error {}

export interface SignUserTransactionsInput {
  ramp: RampProcess;
  userTxs: UnsignedTx[];
}

/**
 * Ported from the widget's sign.actor (EVM paths): walks the user-owned transactions in
 * nonce order, signing typed data (offramp permits) and broadcasting squidRouter
 * transactions with the connected wallet, then submits signatures + hashes via
 * /ramp/update.
 */
export async function signUserTransactions(input: SignUserTransactionsInput): Promise<RampProcess> {
  const { ramp, userTxs } = input;
  if (userTxs.length === 0) {
    return ramp;
  }

  const sortedTxs = [...userTxs].sort((a, b) => a.nonce - b.nonce);
  const signedTxs: PresignedTx[] = [];
  let squidRouterApproveHash: string | undefined;
  let squidRouterSwapHash: string | undefined;
  let squidRouterNoPermitTransferHash: string | undefined;
  let squidRouterNoPermitApproveHash: string | undefined;
  let squidRouterNoPermitSwapHash: string | undefined;

  try {
    for (const tx of sortedTxs) {
      if (isSignedTypedData(tx.txData)) {
        const signedArray = await signMultipleTypedData([tx.txData]);
        signedTxs.push({ ...tx, txData: signedArray[0] } as PresignedTx);
      } else if (isSignedTypedDataArray(tx.txData)) {
        signedTxs.push({ ...tx, txData: await signMultipleTypedData(tx.txData) } as PresignedTx);
      } else if (tx.phase === "squidRouterApprove") {
        squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
      } else if (tx.phase === "squidRouterSwap") {
        squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
      } else if (tx.phase === "squidRouterNoPermitTransfer") {
        squidRouterNoPermitTransferHash = await signAndSubmitEvmTransaction(tx);
      } else if (tx.phase === "squidRouterNoPermitApprove") {
        squidRouterNoPermitApproveHash = await signAndSubmitEvmTransaction(tx);
      } else if (tx.phase === "squidRouterNoPermitSwap") {
        squidRouterNoPermitSwapHash = await signAndSubmitEvmTransaction(tx);
      } else {
        throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("User rejected the request")) {
      throw new UserRejectedError("You rejected the signature request in your wallet.");
    }
    throw error;
  }

  return RampService.updateRamp(ramp.id, signedTxs, {
    squidRouterApproveHash,
    squidRouterNoPermitApproveHash,
    squidRouterNoPermitSwapHash,
    squidRouterNoPermitTransferHash,
    squidRouterSwapHash
  });
}

const POLL_INTERVAL_MS = 3000;

/**
 * Polls /ramp/:id until a terminal phase, invoking onStatus on every tick.
 * Returns a stop() function; mirrors the widget's RampService.pollRampStatus.
 */
export function pollRampUntilTerminal(
  rampId: string,
  onStatus: (status: GetRampStatusResponse) => void,
  onTerminal: (status: GetRampStatusResponse) => void
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      const status = await RampService.getRampStatus(rampId);
      if (stopped) {
        return;
      }
      onStatus(status);
      if (isTerminalPhase(status)) {
        onTerminal(status);
        return;
      }
    } catch {
      // Transient polling failure — keep trying on the next tick.
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  setTimeout(tick, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
  };
}
