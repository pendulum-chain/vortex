import {
  encodeSubmittableExtrinsic,
  getPendulumDetails,
  isStellarOutputTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";
import {
  addFeeDistributionTransaction,
  createAssetHubSourceTransactions,
  createNablaSwapTransactions,
  createSpacewalkTransactions,
  createStellarPaymentTransactions
} from "../common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { validateOfframpQuote, validateStellarOfframp, validateStellarOfframpMetadata } from "../common/validation";

/**
 * Prepares all transactions for an AssetHub to Stellar offramp.
 * This route handles: AssetHub → Pendulum (swap) → Spacewalk → Stellar
 */
export async function prepareAssethubToStellarOfframpTransactions({
  quote,
  signingAccounts,
  stellarPaymentData,
  userAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  // Validate inputs and extract required data
  const { fromNetwork, inputTokenDetails, outputTokenDetails, stellarEphemeralEntry, substrateEphemeralEntry } =
    validateOfframpQuote(quote, signingAccounts);

  const { stellarTokenDetails, stellarPaymentData: validatedStellarPaymentData } = validateStellarOfframp(
    outputTokenDetails,
    stellarPaymentData
  );
  const { offrampAmountBeforeAnchorFeesUnits, offrampAmountBeforeAnchorFeesRaw } = validateStellarOfframpMetadata(quote);

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (validatedStellarPaymentData.amount) {
    const stellarAmount = new Big(validatedStellarPaymentData.amount);
    if (!stellarAmount.eq(offrampAmountBeforeAnchorFeesUnits)) {
      throw new Error(
        `Stellar amount ${stellarAmount.toString()} not equal to expected payment ${offrampAmountBeforeAnchorFeesUnits.toString()}`
      );
    }
  }

  // Initialize state metadata
  stateMeta = {
    substrateEphemeralAddress: substrateEphemeralEntry.address
  };

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  // Create AssetHub source transactions
  await createAssetHubSourceTransactions(
    {
      inputAmountRaw,
      pendulumEphemeralAddress: substrateEphemeralEntry.address,
      userAddress
    },
    unsignedTxs,
    fromNetwork
  );

  // Process Pendulum account
  const substrateAccount = signingAccounts.find(account => account.type === "Substrate");
  if (!substrateAccount) {
    throw new Error("Substrate account not found");
  }

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  let pendulumNonce = 0;

  // Add fee distribution transaction
  pendulumNonce = await addFeeDistributionTransaction(quote, substrateAccount, unsignedTxs, pendulumNonce);

  // Create Nabla swap transactions
  const nablaResult = await createNablaSwapTransactions(
    {
      account: substrateAccount,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      quote
    },
    unsignedTxs,
    pendulumNonce
  );

  pendulumNonce = nablaResult.nextNonce;
  stateMeta = {
    ...stateMeta,
    ...nablaResult.stateMeta
  };

  // Prepare cleanup transaction
  const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
    inputTokenPendulumDetails.currencyId,
    outputTokenPendulumDetails.currencyId
  );

  const pendulumCleanupTx: Omit<UnsignedTx, "nonce"> = {
    meta: {},
    network: Networks.Pendulum,
    phase: "pendulumCleanup",
    signer: substrateAccount.address,
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
  };

  // Create Spacewalk transactions
  const stellarResult = await createSpacewalkTransactions(
    {
      account: substrateAccount,
      outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
      outputTokenDetails: stellarTokenDetails,
      stellarEphemeralEntry,
      stellarPaymentData: validatedStellarPaymentData
    },
    unsignedTxs,
    pendulumCleanupTx,
    pendulumNonce
  );

  stateMeta = {
    ...stateMeta,
    ...stellarResult.stateMeta
  };

  if (!isStellarOutputTokenDetails(outputTokenDetails)) {
    throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
  }

  if (!stellarPaymentData) {
    throw new Error("Stellar payment data must be provided for offramp");
  }

  await createStellarPaymentTransactions(
    {
      ephemeralAddress: stellarEphemeralEntry.address,
      outputAmountUnits: offrampAmountBeforeAnchorFeesUnits,
      outputTokenDetails,
      stellarPaymentData
    },
    unsignedTxs
  );

  return { stateMeta, unsignedTxs };

  return { stateMeta, unsignedTxs };
}
