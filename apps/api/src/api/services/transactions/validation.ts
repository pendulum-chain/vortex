import {
  ApiManager,
  CleanupPhase,
  getNetworkId,
  PresignedTx,
  RampPhase,
  SubstrateApiNetwork,
  substrateAddressEqual
} from "@packages/shared";
import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { Transaction as EvmTransaction } from "ethers";
import httpStatus from "http-status";
import { Networks as StellarNetworks, Transaction as StellarTransaction, TransactionBuilder } from "stellar-sdk";
import logger from "../../../config/logger";
import { APIError } from "../../errors/api-error";

/// Checks if all of the signed transactions exist in the unsigned transactions list.
export function areAllSignedTxsInUnsignedTxs(unsignedTxs: PresignedTx[], signedTxs: PresignedTx[]): boolean {
  for (const signedTx of signedTxs) {
    const match = unsignedTxs.find(
      unsignedTx =>
        unsignedTx.phase === signedTx.phase &&
        unsignedTx.network === signedTx.network &&
        unsignedTx.nonce === signedTx.nonce &&
        unsignedTx.signer === signedTx.signer
    );
    if (!match) {
      return false;
    }
  }

  return true;
}

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

export async function validatePresignedTxs(presignedTxs: PresignedTx[]): Promise<void> {
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
    if (txType === "substrate") await validateSubstrateTransaction(tx);
    if (txType === "stellar") await validateStellarTransaction(tx);
  }
}

function validateEvmTransaction(tx: PresignedTx) {
  const { txData, signer } = tx;

  if (typeof signer !== "string" || !signer.startsWith("0x") || signer.length !== 42) {
    throw new APIError({
      message: "EVM signer must be a valid Ethereum address",
      status: httpStatus.BAD_REQUEST
    });
  }

  const transactionMeta = EvmTransaction.from(txData);
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

async function validateSubstrateTransaction(tx: PresignedTx) {
  const { txData, signer, network } = tx;

  let api: ApiPromise;
  try {
    api = (await ApiManager.getInstance().getApi(network as SubstrateApiNetwork)).api;
  } catch (error) {
    logger.error(`Failed to get Substrate API for network ${network}: ${(error as Error).message}`);
    throw new APIError({
      message: `Invalid Substrate network: ${network}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  let extrinsic: SubmittableExtrinsic<"promise">;
  try {
    extrinsic = api.tx(txData as string);
  } catch (error) {
    throw new APIError({
      message: `Invalid Substrate transaction data: ${(error as Error).message}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!substrateAddressEqual(extrinsic.signer.toString(), signer)) {
    throw new APIError({
      message: `Substrate transaction signer ${extrinsic.signer.toString()} does not match the expected signer ${signer}`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

async function validateStellarTransaction(tx: PresignedTx) {
  const { txData, signer, phase } = tx;

  console.log("Validating Stellar transaction for phase:", phase);

  let transaction: StellarTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(txData as string, StellarNetworks.PUBLIC) as StellarTransaction;
  } catch (error) {
    throw new APIError({
      message: `Invalid Stellar transaction data: ${(error as Error).message}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  console.log("Parsed Stellar transaction source:", transaction.source);

  if (phase === "stellarCreateAccount") {
    if (transaction.operations.length !== 3) {
      throw new APIError({
        message: `Stellar Create Account transaction must have exactly 3 operations, found ${transaction.operations.length}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const createAccountOp = transaction.operations[0];
    if (createAccountOp.type !== "createAccount") {
      throw new APIError({
        message: `First operation in Stellar Create Account transaction must be 'createAccount', found '${createAccountOp.type}'`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (createAccountOp.destination !== signer) {
      throw new APIError({
        message: `Stellar Create Account operation destination ${createAccountOp.destination} does not match the signer ${signer}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const setOptionsOp = transaction.operations[1];
    if (setOptionsOp.type !== "setOptions") {
      throw new APIError({
        message: `Second operation in Stellar Create Account transaction must be 'setOptions', found '${setOptionsOp.type}'`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (setOptionsOp.source !== signer) {
      throw new APIError({
        message: `Stellar Set Options operation source ${setOptionsOp.source} does not match the signer ${signer}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const changeTrustOp = transaction.operations[2];
    if (changeTrustOp.type !== "changeTrust") {
      throw new APIError({
        message: `Second operation in Stellar Create Account transaction must be 'changeTrust', found '${changeTrustOp.type}'`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (changeTrustOp.source !== signer) {
      throw new APIError({
        message: `Stellar Change Trust operation source ${changeTrustOp.source} does not match the signer ${signer}`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }

  if (phase === "stellarPayment") {
    const paymentOp = transaction.operations[0];
    if (paymentOp.type !== "payment") {
      throw new APIError({
        message: `Stellar Payment transaction must have a 'payment' operation, found '${paymentOp.type}'`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (transaction.source !== signer) {
      throw new APIError({
        message: `Stellar Payment transaction source ${transaction.source} does not match the signer ${signer}`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }
}
