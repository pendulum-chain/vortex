import {
  AccountMeta,
  encodeSubmittableExtrinsic,
  getNetworkId,
  getPendulumDetails,
  isEvmTokenDetails,
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
  createEvmSourceTransactions,
  createNablaSwapTransactions,
  createSpacewalkTransactions
} from "../common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { validateOfframpQuote, validateStellarOfframp, validateStellarOfframpMetadata } from "../common/validation";

/**
 * Prepares all transactions for an EVM to Stellar offramp.
 * This route handles: EVM → Pendulum (swap) → Spacewalk → Stellar
 */
export async function prepareEvmToStellarOfframpTransactions({
  quote,
  signingAccounts,
  stellarPaymentData,
  userAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  // Validate inputs and extract required data
  const { fromNetwork, inputTokenDetails, outputTokenDetails, stellarEphemeralEntry, pendulumEphemeralEntry } =
    validateOfframpQuote(quote, signingAccounts);

  validateStellarOfframp(outputTokenDetails, stellarPaymentData);
  validateStellarOfframpMetadata(quote);

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);
  const offrampAmountBeforeAnchorFeesUnits = quote.metadata.pendulumToStellar!.amountOut;
  const offrampAmountBeforeAnchorFeesRaw = quote.metadata.pendulumToStellar!.amountOutRaw;

  if (stellarPaymentData && stellarPaymentData.amount) {
    const stellarAmount = new Big(stellarPaymentData.amount);
    if (!stellarAmount.eq(offrampAmountBeforeAnchorFeesUnits)) {
      throw new Error(
        `Stellar amount ${stellarAmount.toString()} not equal to expected payment ${offrampAmountBeforeAnchorFeesUnits.toString()}`
      );
    }
  }

  // Initialize state metadata
  stateMeta = {
    pendulumEphemeralAddress: pendulumEphemeralEntry.address
  };

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error("EVM to Stellar route requires EVM input token");
  }

  // Create EVM source transactions
  const evmSourceMetadata = await createEvmSourceTransactions(
    {
      fromNetwork,
      fromToken: inputTokenDetails.erc20AddressSourceChain,
      inputAmountRaw,
      pendulumEphemeralAddress: pendulumEphemeralEntry.address,
      toToken: "0xA0b86a33E6441e88C5F2712C3E9b74F5F4e3E3D6", // AXL USDC on Moonbeam
      userAddress
    },
    unsignedTxs
  );

  stateMeta = {
    ...stateMeta,
    ...evmSourceMetadata
  };

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

  // Create Spacewalk transactions
  const stellarResult = await createSpacewalkTransactions(
    {
      account: pendulumAccount,
      outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
      outputTokenDetails: outputTokenDetails as any, // Validated as Stellar token above
      stellarEphemeralEntry,
      stellarPaymentData: stellarPaymentData!
    },
    unsignedTxs,
    pendulumCleanupTx,
    pendulumNonce
  );

  stateMeta = {
    ...stateMeta,
    ...stellarResult.stateMeta
  };

  return { stateMeta, unsignedTxs };
}
