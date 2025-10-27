import { CleanupPhase, getNetworkId, PresignedTx, RampPhase } from "@packages/shared";
import { Transaction } from "ethers";
import httpStatus from "http-status";
import { APIError } from "../../errors/api-error";

function getTransactionTypeForPhase(phase: RampPhase | CleanupPhase): "evm" | "substrate" | "stellar" {
  switch (phase) {
    case "hydrationToAssethubXcm":
    case "moonbeamToPendulumXcm":
    case "pendulumToHydrationXcm":
    case "pendulumToAssethubXcm":
    case "pendulumToMoonbeamXcm":
    case "assethubToPendulum":
    case "hydrationSwap":
    case "subsidizePreSwap":
    case "subsidizePostSwap":
    case "distributeFees":
    case "nablaApprove":
    case "nablaSwap":
    case "spacewalkRedeem":
    case "pendulumCleanup":
    case "moonbeamCleanup":
      return "substrate";
    case "stellarCreateAccount":
    case "stellarPayment":
    case "stellarCleanup":
      return "stellar";
    case "squidRouterApprove":
    case "squidRouterSwap":
      return "evm";
    default:
      return "evm";
  }
}

export function validatePresignedTxs(presignedTxs: PresignedTx[]): void {
  if (!Array.isArray(presignedTxs) || presignedTxs.length > 100) {
    throw new APIError({
      message: "presignedTxs must be an array with 1-100 elements",
      status: httpStatus.BAD_REQUEST
    });
  }

  for (const tx of presignedTxs) {
    if (!tx.txData || !tx.phase || !tx.network || tx.nonce === undefined || !tx.signer) {
      throw new APIError({
        message: "Each transaction must have txData, phase, network, nonce and signer properties",
        status: httpStatus.BAD_REQUEST
      });
    }

    const txType = getTransactionTypeForPhase(tx.phase);
    if (txType === "evm") validateEvmTransaction(tx);
  }
}

function validateEvmTransaction(tx: PresignedTx) {
  const { txData, signer } = tx;

  console.log("Processing EVM transaction for validation:", tx.phase);

  if (typeof signer !== "string" || !signer.startsWith("0x") || signer.length !== 42) {
    throw new APIError({
      message: "EVM signer must be a valid Ethereum address",
      status: httpStatus.BAD_REQUEST
    });
  }

  const transactionMeta = Transaction.from(txData);
  if (!transactionMeta.from) {
    throw new APIError({
      message: "EVM transaction data must be signed and include a 'from' address",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (transactionMeta.from.toLowerCase() !== signer.toLowerCase()) {
    throw new APIError({
      message: `EVM transaction 'from' address ${transactionMeta.from} does not match the signer address ${signer}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (Number(transactionMeta.chainId) !== getNetworkId(tx.network)) {
    throw new APIError({
      message: `EVM transaction chainId ${transactionMeta.chainId} does not match the expected network ID ${getNetworkId(tx.network)}`,
      status: httpStatus.BAD_REQUEST
    });
  }
}
