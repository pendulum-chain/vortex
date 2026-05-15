import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/promise/types";
import {
  ApiManager,
  CleanupPhase,
  EphemeralAccountType,
  EvmTransactionData,
  getNetworkId,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  Networks,
  NUMBER_OF_PRESIGNED_TXS,
  PresignedTx,
  RampDirection,
  RampPhase,
  SignedTypedData,
  SubstrateApiNetwork,
  substrateAddressEqual
} from "@vortexfi/shared";
import { Signature as EvmSignature, Transaction as EvmTransaction, verifyTypedData } from "ethers";
import httpStatus from "http-status";
import { Networks as StellarNetworks, Transaction as StellarTransaction, TransactionBuilder } from "stellar-sdk";
import { config } from "../../../config";
import logger from "../../../config/logger";
import { APIError } from "../../errors/api-error";

function stripSignaturesForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSignaturesForComparison);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .filter(key => key !== "signature")
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stripSignaturesForComparison((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function signedEvmTransactionMatchesUnsigned(
  signedTxData: string,
  unsignedTxData: EvmTransactionData,
  expectedNonce: number
): boolean {
  try {
    const transactionMeta = EvmTransaction.from(signedTxData);
    return (
      transactionMeta.to?.toLowerCase() === unsignedTxData.to.toLowerCase() &&
      transactionMeta.data.toLowerCase() === unsignedTxData.data.toLowerCase() &&
      transactionMeta.value === BigInt(unsignedTxData.value || "0") &&
      transactionMeta.nonce === expectedNonce
    );
  } catch {
    return false;
  }
}

function txDataMatchesSignedSubmission(submittedTx: PresignedTx, unsignedTx: PresignedTx): boolean {
  if (typeof submittedTx.txData === "string" && isEvmTransactionData(unsignedTx.txData)) {
    return signedEvmTransactionMatchesUnsigned(submittedTx.txData, unsignedTx.txData, submittedTx.nonce);
  }

  if (
    (isSignedTypedData(submittedTx.txData) || isSignedTypedDataArray(submittedTx.txData)) &&
    (isSignedTypedData(unsignedTx.txData) || isSignedTypedDataArray(unsignedTx.txData))
  ) {
    return (
      JSON.stringify(stripSignaturesForComparison(submittedTx.txData)) ===
      JSON.stringify(stripSignaturesForComparison(unsignedTx.txData))
    );
  }

  if (typeof submittedTx.txData === "string" && typeof unsignedTx.txData === "string") {
    // Signed Substrate/Stellar payloads cannot be byte-compared to their unsigned payloads here.
    // Their signer/shape checks happen in validatePresignedTxs before this inclusion check.
    return submittedTx.txData === unsignedTx.txData || submittedTx.signer === unsignedTx.signer;
  }

  return JSON.stringify(submittedTx.txData) === JSON.stringify(unsignedTx.txData);
}

/// Checks if all the transactions in 'subset' are contained in 'set' based on phase, network, nonce, signer,
/// and a signed-payload-aware comparison of txData.
export function areAllTxsIncluded(subset: PresignedTx[], set: PresignedTx[]): boolean {
  for (const subsetTx of subset) {
    const match = set.find(
      setTx =>
        setTx.phase === subsetTx.phase &&
        setTx.network === subsetTx.network &&
        setTx.nonce === subsetTx.nonce &&
        setTx.signer === subsetTx.signer &&
        txDataMatchesSignedSubmission(subsetTx, setTx)
    );

    if (!match) {
      return false;
    }
  }

  return true;
}

function getTransactionTypeForPhase(phase: RampPhase | CleanupPhase, network: Networks): EphemeralAccountType {
  // Phases that dispatch polymorphically between substrate and EVM based on the network of the presigned tx.
  switch (phase) {
    case "nablaApprove":
    case "nablaSwap":
    case "distributeFees":
    case "subsidizePreSwap":
    case "subsidizePostSwap":
      return network === Networks.Base ? EphemeralAccountType.EVM : EphemeralAccountType.Substrate;
  }

  switch (phase) {
    case "hydrationToAssethubXcm":
    case "moonbeamToPendulumXcm":
    case "pendulumToHydrationXcm":
    case "pendulumToAssethubXcm":
    case "pendulumToMoonbeamXcm":
    case "assethubToPendulum":
    case "hydrationSwap":
    case "spacewalkRedeem":
    case "pendulumCleanup":
    case "moonbeamCleanup":
    case "hydrationCleanup":
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
    case "brlaPayoutOnBase":
    case "finalSettlementSubsidy":
    case "backupSquidRouterApprove":
    case "backupSquidRouterSwap":
    case "backupApprove":
    case "polygonCleanup":
    case "baseCleanupBrla":
    case "baseCleanupUsdc":
      return EphemeralAccountType.EVM;
    default:
      throw new APIError({
        message: `Unknown phase "${phase}" — cannot determine transaction type`,
        status: httpStatus.BAD_REQUEST
      });
  }
}

function validateBackupTransactions(tx: PresignedTx, ephemerals: { [key in EphemeralAccountType]: string }) {
  const signer = tx.signer.toLowerCase();
  const isEphemeralSigner = Object.values(ephemerals).some(addr => addr && addr.toLowerCase() === signer);

  if (!isEphemeralSigner) {
    return;
  }

  const additionalTxs = tx.meta?.additionalTxs;
  if (!additionalTxs || Object.keys(additionalTxs).length < NUMBER_OF_PRESIGNED_TXS - 1) {
    throw new APIError({
      message: `Transaction for phase ${tx.phase} must include at least ${NUMBER_OF_PRESIGNED_TXS - 1} backup transactions in meta.additionalTxs`,
      status: httpStatus.BAD_REQUEST
    });
  }

  const backupNonces = Object.values(additionalTxs)
    .map(backup => backup.nonce)
    .sort((a, b) => a - b);

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS - 1; i++) {
    const expectedNonce = tx.nonce + 1 + i;
    if (backupNonces[i] !== expectedNonce) {
      throw new APIError({
        message: `Transaction for phase ${tx.phase} has invalid backup nonce sequence. Expected ${expectedNonce}, got ${backupNonces[i]}`,
        status: httpStatus.BAD_REQUEST
      });
    }
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

    const txType = getTransactionTypeForPhase(tx.phase, tx.network);
    if (tx.phase === "moneriumOnrampMint") continue; // Skip validation for this as it's from the user's wallet
    if (
      tx.phase === "squidRouterNoPermitTransfer" ||
      tx.phase === "squidRouterNoPermitApprove" ||
      tx.phase === "squidRouterNoPermitSwap"
    )
      continue; // User-submitted from their own wallet; only the resulting tx hash flows back via additionalData
    if (direction === RampDirection.SELL && (tx.phase === "squidRouterSwap" || tx.phase === "squidRouterApprove")) continue; // Skip validation for this as it's from the user's wallet
    if (txType === EphemeralAccountType.EVM) validateEvmTransaction(tx, ephemerals.EVM);
    if (txType === EphemeralAccountType.Substrate) await validateSubstrateTransaction(tx, ephemerals.Substrate, ephemerals.EVM);
    if (txType === EphemeralAccountType.Stellar) await validateStellarTransaction(tx, ephemerals.Stellar);

    validateBackupTransactions(tx, ephemerals);
  }
}

function validateEvmTransaction(tx: PresignedTx, expectedSigner: string) {
  const { txData, signer } = tx;
  logger.debug(`Validating EVM transaction with signer: ${signer}, on network: ${tx.network}, for phase: ${tx.phase}`);

  if (typeof signer !== "string" || !signer.startsWith("0x") || signer.length !== 42) {
    throw new APIError({
      message: "EVM signer must be a valid Ethereum address",
      status: httpStatus.BAD_REQUEST
    });
  }

  // EIP-712 typed data is signed by the user wallet for permit flows, not by the EVM ephemeral.
  if (isSignedTypedData(txData) || isSignedTypedDataArray(txData)) {
    validateSignedTypedData(tx, signer);
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

function validateSignedTypedData(tx: PresignedTx, expectedSigner: string) {
  const typedDataItems = isSignedTypedDataArray(tx.txData) ? tx.txData : [tx.txData as SignedTypedData];

  for (const typedData of typedDataItems) {
    const signature = typedData.signature;
    if (!signature || Array.isArray(signature)) {
      throw new APIError({
        message: `EVM typed data for phase ${tx.phase} must include exactly one signature`,
        status: httpStatus.BAD_REQUEST
      });
    }

    if (
      typedData.domain.chainId &&
      typedData.domain.chainId !== getNetworkId(tx.network) &&
      Boolean(config.sandboxEnabled) !== true
    ) {
      throw new APIError({
        message: `EVM typed data chainId ${typedData.domain.chainId} does not match the expected network ID ${getNetworkId(tx.network)}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const owner = typedData.message.owner;
    if (typeof owner === "string" && owner.toLowerCase() !== expectedSigner.toLowerCase()) {
      throw new APIError({
        message: `EVM typed data owner ${owner} does not match signer ${expectedSigner}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const recoveredSigner = verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      EvmSignature.from({ r: signature.r, s: signature.s, v: signature.v }).serialized
    );
    if (recoveredSigner.toLowerCase() !== expectedSigner.toLowerCase()) {
      throw new APIError({
        message: `EVM typed data signature was produced by ${recoveredSigner}, expected ${expectedSigner}`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }

  logger.info(`Validated EIP-712 typed data signature for phase ${tx.phase}: ${expectedSigner}`);
}

async function validateSubstrateTransaction(tx: PresignedTx, expectedSignerSubstrate: string, expectedSignerEvm: string) {
  const { txData, signer, network } = tx;
  logger.debug(`Validating Substrate transaction with signer: ${signer}, on network: ${network}, for phase: ${tx.phase}`);
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
