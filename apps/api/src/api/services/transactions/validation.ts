import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/promise/types";
import {
  ApiManager,
  CleanupPhase,
  EphemeralAccountType,
  getNetworkId,
  isSignedTypedData,
  isSignedTypedDataArray,
  PresignedTx,
  RampDirection,
  RampPhase,
  SubstrateApiNetwork,
  substrateAddressEqual
} from "@vortexfi/shared";
import { Transaction as EvmTransaction } from "ethers";
import httpStatus from "http-status";
import { Networks as StellarNetworks, Transaction as StellarTransaction, TransactionBuilder } from "stellar-sdk";
import { config } from "../../../config";
import logger from "../../../config/logger";
import { APIError } from "../../errors/api-error";

/// Checks if all the transactions in 'subset' are contained in 'set' based on phase, network, nonce, signer, and txData.
export function areAllTxsIncluded(subset: PresignedTx[], set: PresignedTx[]): boolean {
  for (const subsetTx of subset) {
    const match = set.find(
      setTx =>
        setTx.phase === subsetTx.phase &&
        setTx.network === subsetTx.network &&
        setTx.nonce === subsetTx.nonce &&
        setTx.signer === subsetTx.signer &&
        JSON.stringify(setTx.txData) === JSON.stringify(subsetTx.txData)
    );

    if (!match) {
      return false;
    }
  }

  return true;
}

function getTransactionTypeForPhase(phase: RampPhase | CleanupPhase): EphemeralAccountType {
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
      return EphemeralAccountType.Substrate;
    case "stellarCreateAccount":
    case "stellarPayment":
    case "stellarCleanup":
      return EphemeralAccountType.Stellar;
    case "squidRouterApprove":
    case "squidRouterSwap":
    case "squidRouterPermitExecute":
    case "squidRouterPay":
    case "moneriumOnrampSelfTransfer":
    case "moneriumOnrampMint":
    case "fundEphemeral":
    case "destinationTransfer":
    case "moonbeamToPendulum":
    case "alfredpayOnrampMint":
    case "alfredpayOfframpTransfer":
    case "brlaOnrampMint":
    case "brlaPayoutOnMoonbeam":
    case "finalSettlementSubsidy":
    case "backupSquidRouterApprove":
    case "backupSquidRouterSwap":
    case "backupApprove":
      return EphemeralAccountType.EVM;
    default:
      throw new APIError({
        message: `Unknown phase "${phase}" — cannot determine transaction type`,
        status: httpStatus.BAD_REQUEST
      });
  }
}

export async function validatePresignedTxs(
  direction: RampDirection,
  presignedTxs: PresignedTx[],
  ephemerals: { [key in EphemeralAccountType]: string }
): Promise<void> {
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
    if (tx.phase === "moneriumOnrampMint") continue; // Skip validation for this as it's from the user's wallet
    if (txType === EphemeralAccountType.EVM) validateEvmTransaction(tx, ephemerals.EVM);
    if (txType === EphemeralAccountType.Substrate) await validateSubstrateTransaction(tx, ephemerals.Substrate, ephemerals.EVM);
    if (txType === EphemeralAccountType.Stellar) await validateStellarTransaction(tx, ephemerals.Stellar);
  }
}

function validateEvmTransaction(tx: PresignedTx, expectedSigner: string) {
  const { txData, signer } = tx;

  // EIP-712 typed data: full content validation (spender, value, deadline, verifyingContract) requires
  // domain-specific knowledge per integration. Validate signer only here.
  if (isSignedTypedData(txData) || isSignedTypedDataArray(txData)) {
    if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
      throw new APIError({
        message: `EVM typed data signer ${signer} does not match expected signer ${expectedSigner}`,
        status: httpStatus.BAD_REQUEST
      });
    }
    logger.info(`Validated EIP-712 typed data signer for phase ${tx.phase}: ${signer}`);
    return;
  }

  if (!expectedSigner) {
    throw new APIError({
      message: "Expected signer for EVM transaction is not provided",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new APIError({
      message: `EVM transaction signer ${signer} does not match the expected signer ${expectedSigner}`,
      status: httpStatus.BAD_REQUEST
    });
  }

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

  if (Number(transactionMeta.chainId) !== getNetworkId(tx.network) && Boolean(config.sandboxEnabled) !== true) {
    throw new APIError({
      message: `EVM transaction chainId ${transactionMeta.chainId} does not match the expected network ID ${getNetworkId(tx.network)}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!transactionMeta.to) {
    throw new APIError({
      message: "EVM transaction must have a 'to' address (contract creation not allowed)",
      status: httpStatus.BAD_REQUEST
    });
  }
}

async function validateSubstrateTransaction(tx: PresignedTx, expectedSignerSubstrate: string, expectedSignerEvm: string) {
  const { txData, signer, network } = tx;

  if (!expectedSignerSubstrate && !expectedSignerEvm) {
    throw new APIError({
      message: `Expected signer for Substrate transaction is not provided for phase ${tx.phase}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (tx.phase === "moonbeamToPendulumXcm" || tx.phase === "moonbeamCleanup") {
    // Moonbeam uses EVM addresses but the transactions are Substrate-based
    if (signer.toLowerCase() !== expectedSignerEvm.toLowerCase()) {
      throw new APIError({
        message: `Substrate transaction signer ${signer} does not match the expected signer ${expectedSignerEvm} for phase ${tx.phase}.`,
        status: httpStatus.BAD_REQUEST
      });
    }
  } else if (signer.toLowerCase() !== expectedSignerSubstrate.toLowerCase()) {
    throw new APIError({
      message: `Substrate transaction signer ${signer} does not match the expected signer ${expectedSignerSubstrate} for phase ${tx.phase}.`,
      status: httpStatus.BAD_REQUEST
    });
  }

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

  let extrinsic: SubmittableExtrinsic;
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
      message: `Substrate transaction signer ${extrinsic.signer.toString()} does not match the expected signer ${signer} for phase ${tx.phase}.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  const method = extrinsic.method;
  if (!method || !method.section || !method.method) {
    throw new APIError({
      message: `Substrate transaction for phase ${tx.phase} has no decodable method`,
      status: httpStatus.BAD_REQUEST
    });
  }
  logger.debug(`Validated Substrate extrinsic for phase ${tx.phase}: ${method.section}.${method.method}`);
}

async function validateStellarTransaction(tx: PresignedTx, expectedSigner: string) {
  const { txData, signer, phase } = tx;

  if (!expectedSigner) {
    throw new APIError({
      message: "Expected signer for Stellar transaction is not provided",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new APIError({
      message: `Stellar transaction signer ${signer} does not match the expected signer ${expectedSigner} for phase ${phase}.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  let transaction: StellarTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(txData as string, StellarNetworks.PUBLIC) as StellarTransaction;
  } catch (error) {
    throw new APIError({
      message: `Invalid Stellar transaction data: ${(error as Error).message}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  logger.debug("Parsed Stellar transaction source:", transaction.source);

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
    if (!createAccountOp.startingBalance || parseFloat(createAccountOp.startingBalance) <= 0) {
      throw new APIError({
        message: "Stellar Create Account operation must have a positive startingBalance",
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
    if (setOptionsOp.type === "setOptions" && !setOptionsOp.signer) {
      throw new APIError({
        message: "Stellar SetOptions operation must include a signer (cosigner) key",
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
    if (changeTrustOp.type === "changeTrust" && !changeTrustOp.line) {
      throw new APIError({
        message: "Stellar ChangeTrust operation must specify a trust line asset",
        status: httpStatus.BAD_REQUEST
      });
    }
  }

  if (phase === "stellarPayment") {
    if (transaction.operations.length !== 1) {
      throw new APIError({
        message: `Stellar Payment transaction must have exactly 1 operation, found ${transaction.operations.length}`,
        status: httpStatus.BAD_REQUEST
      });
    }

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

    if (paymentOp.type === "payment") {
      if (!paymentOp.destination) {
        throw new APIError({
          message: "Stellar Payment operation must have a destination address",
          status: httpStatus.BAD_REQUEST
        });
      }
      if (!paymentOp.amount || parseFloat(paymentOp.amount) <= 0) {
        throw new APIError({
          message: "Stellar Payment operation must have a positive amount",
          status: httpStatus.BAD_REQUEST
        });
      }
      if (!paymentOp.asset) {
        throw new APIError({
          message: "Stellar Payment operation must specify an asset",
          status: httpStatus.BAD_REQUEST
        });
      }
    }
  }

  if (phase === "stellarCleanup") {
    if (transaction.source !== signer) {
      throw new APIError({
        message: `Stellar Cleanup transaction source ${transaction.source} does not match the signer ${signer}`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (transaction.operations.length === 0 || transaction.operations.length > 5) {
      throw new APIError({
        message: `Stellar Cleanup transaction has unexpected operation count: ${transaction.operations.length} (expected 1-5)`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }
}
