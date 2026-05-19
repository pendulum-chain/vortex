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
import { Signature as EvmSignature, verifyTypedData } from "ethers";
import httpStatus from "http-status";
import { Networks as StellarNetworks, Transaction as StellarTransaction, TransactionBuilder } from "stellar-sdk";
import { type Hex, keccak256, parseTransaction, recoverAddress, serializeTransaction, toBytes } from "viem";
import { config } from "../../../config";
import logger from "../../../config/logger";
import { APIError } from "../../errors/api-error";

interface VerifiedEvmTransaction {
  signer: string;
  nonce: number;
  to: string;
  data: string;
  value: bigint;
  chainId: number;
}

async function verifySignedEvmTransaction(
  signedTxHex: string,
  expectedSigner: string,
  expectedNonce: number,
  network: Networks,
  unsignedTxData?: EvmTransactionData
): Promise<VerifiedEvmTransaction> {
  const parsed = parseTransaction(signedTxHex as Hex);

  if (parsed.nonce === undefined) {
    throw new APIError({
      message: "Signed EVM transaction must include a nonce",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (parsed.r === undefined || parsed.s === undefined) {
    throw new APIError({
      message: "Signed EVM transaction must include signature components",
      status: httpStatus.BAD_REQUEST
    });
  }

  const unsignedTx = serializeTransaction({
    accessList: parsed.accessList,
    chainId: parsed.chainId,
    data: parsed.data,
    gas: parsed.gas,
    gasPrice: parsed.gasPrice,
    maxFeePerGas: parsed.maxFeePerGas,
    maxPriorityFeePerGas: parsed.maxPriorityFeePerGas,
    nonce: parsed.nonce,
    to: parsed.to,
    type: parsed.type || "eip1559",
    value: parsed.value ?? 0n
  } as any);

  const hash = keccak256(toBytes(unsignedTx));

  const yParity = parsed.yParity !== undefined ? Number(parsed.yParity) : parsed.v !== undefined ? Number(parsed.v) - 27 : 0;
  const signature = (parsed.r + parsed.s.slice(2) + yParity.toString(16).padStart(2, "0")) as `0x${string}`;

  const recoveredSigner = await recoverAddress({ hash, signature });

  if (recoveredSigner.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new APIError({
      message: `Recovered signer ${recoveredSigner} does not match expected signer ${expectedSigner}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (parsed.nonce !== expectedNonce) {
    throw new APIError({
      message: `Signed EVM transaction nonce ${parsed.nonce} does not match expected nonce ${expectedNonce}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  // Reject both wrong-chain and chainless (replay-protectable) txs. parseTransaction returns
  // chainId === undefined for pre-EIP-155 raw txs, which would otherwise bypass the check.
  if (Number(parsed.chainId || 0) !== getNetworkId(network) && Boolean(config.sandboxEnabled) !== true) {
    throw new APIError({
      message: `Signed EVM transaction chainId ${parsed.chainId ?? "missing"} does not match expected network ID ${getNetworkId(network)}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (unsignedTxData) {
    if (parsed.to && parsed.to.toLowerCase() !== unsignedTxData.to.toLowerCase()) {
      throw new APIError({
        message: `Signed EVM transaction 'to' ${parsed.to} does not match expected ${unsignedTxData.to}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    if (parsed.data?.toLowerCase() !== unsignedTxData.data.toLowerCase()) {
      throw new APIError({
        message: "Signed EVM transaction data does not match expected data",
        status: httpStatus.BAD_REQUEST
      });
    }

    if ((parsed.value ?? 0n) !== BigInt(unsignedTxData.value || "0")) {
      throw new APIError({
        message: `Signed EVM transaction value ${parsed.value} does not match expected ${unsignedTxData.value || "0"}`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }

  if (!parsed.to) {
    throw new APIError({
      message: "EVM transaction must have a 'to' address (contract creation not allowed)",
      status: httpStatus.BAD_REQUEST
    });
  }

  return {
    chainId: Number(parsed.chainId || 0),
    data: parsed.data || "0x",
    nonce: parsed.nonce,
    signer: recoveredSigner,
    to: parsed.to,
    value: parsed.value || 0n
  };
}

/// Checks if all the transactions in 'subset' are contained in 'set' based on phase, network, nonce, and signer.
export function areAllTxsIncluded(subset: PresignedTx[], set: PresignedTx[]): boolean {
  for (const subsetTx of subset) {
    const match = set.find(
      setTx =>
        setTx.phase === subsetTx.phase &&
        setTx.network === subsetTx.network &&
        setTx.nonce === subsetTx.nonce &&
        setTx.signer === subsetTx.signer
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

async function validateBackupTransactions(
  tx: PresignedTx,
  ephemerals: { [key in EphemeralAccountType]: string },
  unsignedTxData?: EvmTransactionData
) {
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

  const backupsSorted = Object.values(additionalTxs).sort((a, b) => a.nonce - b.nonce);
  const txType = getTransactionTypeForPhase(tx.phase, tx.network);

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS - 1; i++) {
    const expectedNonce = tx.nonce + 1 + i;
    const backup = backupsSorted[i];
    if (backup.nonce !== expectedNonce) {
      throw new APIError({
        message: `Transaction for phase ${tx.phase} has invalid backup nonce sequence. Expected ${expectedNonce}, got ${backup.nonce}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    // Re-run the primary's validator against each backup so backups cannot encode a different
    // signer or a different call than the primary tx (the engine may broadcast a backup on retry).
    const backupTx: PresignedTx = {
      meta: {},
      network: tx.network,
      nonce: backup.nonce,
      phase: tx.phase,
      signer: tx.signer,
      txData: backup.txData
    };

    if (txType === EphemeralAccountType.EVM) {
      if (typeof backup.txData !== "string") {
        throw new APIError({
          message: `Backup EVM transaction for phase ${tx.phase} must be a signed hex string`,
          status: httpStatus.BAD_REQUEST
        });
      }
      await verifySignedEvmTransaction(backup.txData, tx.signer, expectedNonce, tx.network, unsignedTxData);
    } else if (txType === EphemeralAccountType.Substrate) {
      await validateSubstrateTransaction(backupTx, ephemerals.Substrate, ephemerals.EVM);
      await assertSubstrateBackupMatchesPrimary(tx, backup);
    } else if (txType === EphemeralAccountType.Stellar) {
      await validateStellarTransaction(backupTx, ephemerals.Stellar);
    }
  }
}

// Ensures a Substrate backup encodes the same call (section/method/args) as the primary, so a
// malicious client cannot register a backup that would broadcast a different on-chain action
// if the primary fails.
async function assertSubstrateBackupMatchesPrimary(primary: PresignedTx, backup: PresignedTx) {
  const api = (await ApiManager.getInstance().getApi(primary.network as SubstrateApiNetwork)).api;
  const primaryCallHex = api.tx(primary.txData as string).method.toHex();
  const backupCallHex = api.tx(backup.txData as string).method.toHex();

  if (primaryCallHex !== backupCallHex) {
    throw new APIError({
      message: `Substrate backup transaction for phase ${primary.phase} does not encode the same call as the primary transaction`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

export async function validatePresignedTxs(
  direction: RampDirection,
  presignedTxs: PresignedTx[],
  ephemerals: { [key in EphemeralAccountType]: string },
  unsignedTxs: PresignedTx[],
  options: { requireComplete?: boolean } = {}
): Promise<void> {
  const requireComplete = options.requireComplete ?? true;

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

    // These phases are signed by the end user's own wallet, not by an ephemeral account, so the
    // server cannot recover or shape-check them. moneriumOnrampMint, squidRouterNoPermit*, and
    // squidRouterSwap/Approve on SELL all flow back to us only via tx hashes in additionalData.
    const isUserWalletPhase =
      tx.phase === "moneriumOnrampMint" ||
      tx.phase === "squidRouterNoPermitTransfer" ||
      tx.phase === "squidRouterNoPermitApprove" ||
      tx.phase === "squidRouterNoPermitSwap" ||
      (direction === RampDirection.SELL && (tx.phase === "squidRouterSwap" || tx.phase === "squidRouterApprove"));
    if (isUserWalletPhase) continue;

    const txType = getTransactionTypeForPhase(tx.phase, tx.network);
    let evmUnsignedTxData: EvmTransactionData | undefined;
    if (txType === EphemeralAccountType.EVM) {
      const matchingUnsigned = unsignedTxs?.find(
        u =>
          u.phase === tx.phase &&
          u.network === tx.network &&
          u.nonce === tx.nonce &&
          u.signer.toLowerCase() === tx.signer.toLowerCase()
      );
      if (!matchingUnsigned) {
        logger.info(
          `No matching unsigned transaction found for EVM transaction with phase ${tx.phase}, network ${tx.network}, signer ${tx.signer}`
        );
        throw new APIError({
          message: "Some presigned transactions do not match any unsigned transaction",
          status: httpStatus.BAD_REQUEST
        });
      }
      evmUnsignedTxData = matchingUnsigned.txData as EvmTransactionData;
      await validateEvmTransaction(tx, ephemerals.EVM, matchingUnsigned.txData);
    }
    if (txType === EphemeralAccountType.Substrate) await validateSubstrateTransaction(tx, ephemerals.Substrate, ephemerals.EVM);
    if (txType === EphemeralAccountType.Stellar) await validateStellarTransaction(tx, ephemerals.Stellar);

    await validateBackupTransactions(tx, ephemerals, evmUnsignedTxData);
  }

  if (!areAllTxsIncluded(presignedTxs, unsignedTxs)) {
    throw new APIError({
      message: "Some presigned transactions do not match any unsigned transaction",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!requireComplete) return;

  const ephemeralSigners = new Set(
    Object.values(ephemerals)
      .filter((v): v is string => Boolean(v))
      .map(s => s.toLowerCase())
  );
  const ephemeralUnsigned = unsignedTxs.filter(tx => ephemeralSigners.has(tx.signer.toLowerCase()));
  const ephemeralPresigned = presignedTxs.filter(tx => ephemeralSigners.has(tx.signer.toLowerCase()));
  if (!areAllTxsIncluded(ephemeralUnsigned, ephemeralPresigned)) {
    throw new APIError({
      message: "Not all unsigned transactions have a corresponding presigned transaction",
      status: httpStatus.BAD_REQUEST
    });
  }
}

async function validateEvmTransaction(
  tx: PresignedTx,
  expectedSigner: string,
  unsignedTxData?: string | EvmTransactionData | SignedTypedData | SignedTypedData[]
) {
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
    validateSignedTypedData(tx, signer, unsignedTxData);
    return;
  }

  if (typeof txData !== "string") {
    throw new APIError({
      message: "EVM transaction data must be a signed hex string",
      status: httpStatus.BAD_REQUEST
    });
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

  const evmUnsigned = unsignedTxData && isEvmTransactionData(unsignedTxData) ? unsignedTxData : undefined;
  await verifySignedEvmTransaction(txData, signer, tx.nonce, tx.network, evmUnsigned);
}

function validateSignedTypedData(
  tx: PresignedTx,
  expectedSigner: string,
  unsignedTxData?: string | EvmTransactionData | SignedTypedData | SignedTypedData[]
) {
  const typedDataItems = isSignedTypedDataArray(tx.txData) ? tx.txData : [tx.txData as SignedTypedData];

  // Server-issued unsigned typed data is the source of truth. The signed form must match every
  // field except the appended signature, otherwise the user could swap token/spender/value/etc.
  let unsignedItems: SignedTypedData[] | undefined;
  if (unsignedTxData !== undefined) {
    if (isSignedTypedDataArray(unsignedTxData)) {
      unsignedItems = unsignedTxData;
    } else if (isSignedTypedData(unsignedTxData)) {
      unsignedItems = [unsignedTxData];
    } else {
      throw new APIError({
        message: `EVM typed data for phase ${tx.phase} does not match the server-issued unsigned typed data shape`,
        status: httpStatus.BAD_REQUEST
      });
    }

    if (unsignedItems.length !== typedDataItems.length) {
      throw new APIError({
        message: `EVM typed data for phase ${tx.phase} has ${typedDataItems.length} items, expected ${unsignedItems.length}`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }

  for (let i = 0; i < typedDataItems.length; i++) {
    const typedData = typedDataItems[i];
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

    if (unsignedItems) {
      assertTypedDataMatchesUnsigned(typedData, unsignedItems[i], tx.phase);
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

// Deep-compare domain/primaryType/types/message between signed and unsigned typed data.
// Any divergence (e.g. swapped token, inflated value, different spender, extended deadline) is
// fatal because the user must sign exactly what the server prepared.
function assertTypedDataMatchesUnsigned(signed: SignedTypedData, unsigned: SignedTypedData, phase: RampPhase | CleanupPhase) {
  const stripSig = (td: SignedTypedData) => {
    const { signature: _sig, ...rest } = td;
    return rest;
  };
  const a = stripSig(signed);
  const b = stripSig(unsigned);
  if (!deepEqualNormalized(a, b)) {
    throw new APIError({
      message: `EVM typed data for phase ${phase} does not match the server-issued unsigned typed data`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

function deepEqualNormalized(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  if (typeof a === "bigint" || typeof b === "bigint") return String(a) === String(b);
  if (typeof a === "number" || typeof b === "number") return String(a) === String(b);
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqualNormalized(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => deepEqualNormalized((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
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
