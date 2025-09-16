import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  ApiManager,
  createMoonbeamToPendulumXCM,
  createNablaTransactionsForOnramp,
  encodeSubmittableExtrinsic,
  getNetworkFromDestination,
  getNetworkId,
  MoonbeamTokenDetails,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  PendulumTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import Partner from "../../../../../models/partner.model";
import { QuoteTicketAttributes, QuoteTicketMetadata } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { priceFeedService } from "../../../priceFeed.service";
import { prepareMoonbeamCleanupTransaction } from "../../moonbeam/cleanup";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase
 * @param quote The quote ticket
 * @returns The encoded transaction
 */
export async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  // Get the API instance
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  // Get the metadata with USD fee structure
  const metadata = quote.metadata as QuoteTicketMetadata;
  if (!metadata.usdFeeStructure) {
    logger.warn("No USD fee structure found in quote metadata, skipping fee distribution transaction");
    return null;
  }

  // Read fee components from metadata.usdFeeStructure
  const networkFeeUSD = metadata.usdFeeStructure.network;
  const vortexFeeUSD = metadata.usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = metadata.usdFeeStructure.partnerMarkup;

  // Get payout addresses
  const vortexPartner = await Partner.findOne({
    where: { isActive: true, name: "vortex", rampType: quote.rampType }
  });
  if (!vortexPartner || !vortexPartner.payoutAddress) {
    logger.warn("Vortex partner or payout address not found, skipping fee distribution transaction");
    return null;
  }
  const vortexPayoutAddress = vortexPartner.payoutAddress;

  let partnerPayoutAddress = null;
  if (quote.partnerId) {
    const quotePartner = await Partner.findOne({
      where: { id: quote.partnerId, isActive: true, rampType: quote.rampType }
    });
    if (quotePartner && quotePartner.payoutAddress) {
      partnerPayoutAddress = quotePartner.payoutAddress;
    }
  }

  // Determine stablecoin based on destination network
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    logger.warn(`Invalid network for destination ${quote.to}, skipping fee distribution transaction`);
    return null;
  }

  // Select stablecoin based on destination network
  const isAssetHubDestination = toNetwork === Networks.AssetHub;
  const stablecoinDetails = isAssetHubDestination ? PENDULUM_USDC_ASSETHUB : PENDULUM_USDC_AXL;
  const stablecoinCurrencyId = stablecoinDetails.currencyId;
  const stablecoinDecimals = stablecoinDetails.decimals;

  // Convert USD fees to stablecoin raw units
  const networkFeeStablecoinRaw = multiplyByPowerOfTen(networkFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const vortexFeeStablecoinRaw = multiplyByPowerOfTen(vortexFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const partnerMarkupFeeStablecoinRaw = multiplyByPowerOfTen(partnerMarkupFeeUSD, stablecoinDecimals).toFixed(0, 0);

  // Build transfers
  const transfers = [];

  if (new Big(networkFeeStablecoinRaw).gt(0)) {
    transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, networkFeeStablecoinRaw));
  }

  if (new Big(vortexFeeStablecoinRaw).gt(0)) {
    transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinRaw));
  }

  if (new Big(partnerMarkupFeeStablecoinRaw).gt(0) && partnerPayoutAddress) {
    transfers.push(api.tx.tokens.transferKeepAlive(partnerPayoutAddress, stablecoinCurrencyId, partnerMarkupFeeStablecoinRaw));
  }

  // Create batch transaction
  if (transfers.length > 0) {
    const batchTx = api.tx.utility.batchAll(transfers);
    // Create unsigned transaction (don't sign it here)
    return encodeSubmittableExtrinsic(batchTx);
  }

  return null;
}

/**
 * Adds fee distribution transaction if available
 * @param quote Quote ticket
 * @param account Account metadata
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addFeeDistributionTransaction(
  quote: QuoteTicketAttributes,
  account: AccountMeta,
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  // Generate the fee distribution transaction
  const feeDistributionTx = await createFeeDistributionTransaction(quote);

  if (feeDistributionTx) {
    unsignedTxs.push({
      meta: {},
      network: account.network,
      nonce: nextNonce,
      phase: "distributeFees",
      signer: account.address,
      txData: feeDistributionTx
    });
    nextNonce++;
  }

  return nextNonce;
}

/**
 * Creates Moonbeam to Pendulum XCM transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addMoonbeamTransactions(
  params: {
    pendulumEphemeralAddress: string;
    inputAmountPostAnchorFeeRaw: string;
    inputTokenDetails: MoonbeamTokenDetails;
    account: AccountMeta;
    toNetworkId: number;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const { pendulumEphemeralAddress, inputAmountPostAnchorFeeRaw, inputTokenDetails, account, toNetworkId } = params;

  // Create and add Moonbeam to Pendulum XCM transaction
  const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
    pendulumEphemeralAddress,
    inputAmountPostAnchorFeeRaw,
    inputTokenDetails.moonbeamErc20Address
  );

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "moonbeamToPendulumXcm",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction)
  });
  // For some reason, the Moonbeam to Pendulum XCM transaction causes a nonce increment of 2.
  nextNonce = nextNonce + 2;

  // Create and add Moonbeam cleanup transaction
  const moonbeamCleanupTransaction = await prepareMoonbeamCleanupTransaction();

  // For assethub, we skip the 2 squidrouter transactions, so nonce is 2 lower.
  // TODO is the moonbeamCleanup nonce too high?
  const moonbeamCleanupNonce =
    toNetworkId === getNetworkId(Networks.AssetHub)
      ? nextNonce // no nonce increase we skip squidrouter transactions
      : nextNonce + 2; // +2 because we need to account for squidrouter approve and swap

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: moonbeamCleanupNonce,
    phase: "moonbeamCleanup",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(moonbeamCleanupTransaction)
  });

  return nextNonce;
}

/**
 * Creates Nabla swap transactions for Pendulum
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function addNablaSwapTransactions(
  params: {
    quote: QuoteTicketAttributes;
    account: AccountMeta;
    inputTokenPendulumDetails: PendulumTokenDetails;
    outputTokenPendulumDetails: PendulumTokenDetails;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { quote, account, inputTokenPendulumDetails, outputTokenPendulumDetails } = params;

  // The input amount for the swap was already calculated in the quote.
  const inputAmountForNablaSwapRaw = multiplyByPowerOfTen(
    new Big(quote.metadata.inputAmountForNablaSwapDecimal),
    inputTokenPendulumDetails.decimals
  ).toFixed(0, 0);

  // For these minimums, we use the output amount after anchor fee deduction but before the other fees are deducted.
  // This is because for onramps, the anchor fee is deducted before the nabla swap.
  const anchorFeeInSwapOutputCurrency = await priceFeedService.convertCurrency(
    quote.fee.anchor,
    quote.inputCurrency,
    outputTokenPendulumDetails.currency // Use the currency of the output token's pendulum representative
  );
  const totalFeeInSwapOutputCurrency = await priceFeedService.convertCurrency(
    quote.fee.total,
    quote.inputCurrency,
    outputTokenPendulumDetails.currency // Use the currency of the output token's pendulum representative
  );
  const outputAfterAnchorFee = new Big(quote.outputAmount)
    .plus(totalFeeInSwapOutputCurrency)
    .minus(anchorFeeInSwapOutputCurrency);

  const nablaSoftMinimumOutput = outputAfterAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
  const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(nablaSoftMinimumOutput, outputTokenPendulumDetails.decimals).toFixed(
    0,
    0
  );

  const nablaHardMinimumOutput = outputAfterAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN);
  const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(nablaHardMinimumOutput, outputTokenPendulumDetails.decimals).toFixed(
    0,
    0
  );

  const { approve, swap } = await createNablaTransactionsForOnramp(
    inputAmountForNablaSwapRaw,
    account,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw
  );

  // Add Nabla approve transaction
  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "nablaApprove",
    signer: account.address,
    txData: approve.transaction
  });
  nextNonce++;

  // Add Nabla swap transaction
  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "nablaSwap",
    signer: account.address,
    txData: swap.transaction
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      inputAmountBeforeSwapRaw: inputAmountForNablaSwapRaw,
      nabla: {
        approveExtrinsicOptions: approve.extrinsicOptions,
        swapExtrinsicOptions: swap.extrinsicOptions
      },
      nablaSoftMinimumOutputRaw
    }
  };
}

/**
 * Creates Pendulum cleanup transaction
 * @param params Transaction parameters
 * @returns Cleanup transaction template
 */
export async function addPendulumCleanupTx(params: {
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  account: AccountMeta;
}): Promise<Omit<UnsignedTx, "nonce">> {
  const { inputTokenPendulumDetails, outputTokenPendulumDetails, account } = params;

  const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
    inputTokenPendulumDetails.currencyId,
    outputTokenPendulumDetails.currencyId
  );

  return {
    meta: {},
    network: account.network,
    phase: "pendulumCleanup",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
  };
}
