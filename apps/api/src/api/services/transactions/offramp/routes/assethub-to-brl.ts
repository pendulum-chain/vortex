import {
  AccountMeta,
  encodeSubmittableExtrinsic,
  FiatToken,
  getNetworkId,
  getPendulumDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
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
  const { fromNetwork, inputTokenDetails, outputTokenDetails, pendulumEphemeralEntry } = validateOfframpQuote(
    quote,
    signingAccounts
  );

  validateBRLOfframp(quote, { brlaEvmAddress, pixDestination, receiverTaxId, taxId });

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);
  const offrampAmountBeforeAnchorFeesRaw = quote.metadata.pendulumToMoonbeamXcm!.outputAmountRaw;

  // Initialize state metadata
  stateMeta = {
    pendulumEphemeralAddress: pendulumEphemeralEntry.address
  };

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  // Create AssetHub source transactions
  await createAssetHubSourceTransactions(
    {
      inputAmountRaw,
      pendulumEphemeralAddress: pendulumEphemeralEntry.address,
      userAddress
    },
    unsignedTxs,
    fromNetwork
  );

  // Process Pendulum account
  const pendulumAccount = signingAccounts.find(account => account.network === Networks.Pendulum);
  if (!pendulumAccount) {
    throw new Error("Pendulum account not found");
  }

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  let pendulumNonce = 0;

  // Add fee distribution transaction
  pendulumNonce = await addFeeDistributionTransaction(quote, pendulumAccount, unsignedTxs, pendulumNonce);

  // Create Nabla swap transactions
  const nablaResult = await createNablaSwapTransactions(
    {
      account: pendulumAccount,
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
    network: pendulumAccount.network,
    phase: "pendulumCleanup",
    signer: pendulumAccount.address,
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
  };

  // Create BRL transactions
  const brlResult = await createBRLTransactions(
    {
      account: pendulumAccount,
      brlaEvmAddress: brlaEvmAddress!,
      outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
      outputTokenPendulumDetails: outputTokenDetails.pendulumRepresentative,
      pixDestination: pixDestination!,
      receiverTaxId: receiverTaxId!,
      taxId: taxId!
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
