import { encodeSubmittableExtrinsic, getPendulumDetails, Networks, UnsignedTx } from "@vortexfi/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";
import {
  addFeeDistributionTransaction,
  createAssetHubSourceTransactions,
  createBRLTransactions,
  createNablaSwapTransactions
} from "../common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { validateBRLOfframp, validateOfframpQuote } from "../common/validation";

/**
 * Prepares all transactions for an AssetHub to BRL offramp.
 * This route handles: AssetHub → Pendulum (swap) → Moonbeam (BRL)
 */
export async function prepareAssethubToBRLOfframpTransactions({
  quote,
  signingAccounts,
  userAddress,
  pixDestination,
  taxId,
  receiverTaxId,
  brlaEvmAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  // Validate inputs and extract required data
  const { fromNetwork, inputTokenDetails, outputTokenDetails, substrateEphemeralEntry } = validateOfframpQuote(
    quote,
    signingAccounts
  );

  const {
    brlaEvmAddress: validatedBrlaEvmAddress,
    pixDestination: validatedPixDestination,
    taxId: validatedTaxId,
    receiverTaxId: validatedReceiverTaxId,
    offrampAmountBeforeAnchorFeesRaw
  } = validateBRLOfframp(quote, { brlaEvmAddress, pixDestination, receiverTaxId, taxId });

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

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

  // Create BRL transactions
  const brlResult = await createBRLTransactions(
    {
      account: substrateAccount,
      brlaEvmAddress: validatedBrlaEvmAddress,
      outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
      outputTokenPendulumDetails: outputTokenDetails.pendulumRepresentative,
      pixDestination: validatedPixDestination,
      receiverTaxId: validatedReceiverTaxId,
      taxId: validatedTaxId
    },
    unsignedTxs,
    pendulumCleanupTx,
    pendulumNonce
  );

  stateMeta = {
    ...stateMeta,
    ...brlResult.stateMeta
  };

  return { stateMeta, unsignedTxs };
}
