import {
  AccountMeta,
  ApiManager,
  encodeSubmittableExtrinsic,
  getNetworkFromDestination,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  RampDirection,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import { QuoteTicketAttributes } from "../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { getZenlinkIdForAsset } from "../../zenlink";

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase.
 * This is shared between onramp and offramp flows.
 *
 * @param quote The quote ticket
 * @returns The encoded transaction or null if no fees to distribute
 */
export async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  const rampDirection = quote.rampType;

  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    logger.warn("No USD fee structure found in quote metadata, skipping fee distribution transaction");
    return null;
  }

  const networkFeeUSD = usdFeeStructure.network;
  const vortexFeeUSD = usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = usdFeeStructure.partnerMarkup;

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

  // Determine network reference based on ramp direction
  // - offramp: use source network (quote.from)
  // - onramp: use destination network (quote.to)
  const networkReference = rampDirection === RampDirection.SELL ? quote.from : quote.to;
  const network = getNetworkFromDestination(networkReference);
  if (!network) {
    const fieldName = rampDirection === RampDirection.SELL ? "source" : "destination";
    logger.warn(`Invalid network for ${fieldName} ${networkReference}, skipping fee distribution transaction`);
    return null;
  }

  // Select stablecoin based on network
  const isAssetHubNetwork = network === Networks.AssetHub;
  const stablecoinDetails = isAssetHubNetwork ? PENDULUM_USDC_ASSETHUB : PENDULUM_USDC_AXL;
  const stablecoinCurrencyId = stablecoinDetails.currencyId;
  const stablecoinDecimals = stablecoinDetails.decimals;

  // Convert USD fees to stablecoin raw units
  const networkFeeStablecoinRaw = multiplyByPowerOfTen(networkFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const vortexFeeStablecoinRaw = multiplyByPowerOfTen(vortexFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const partnerMarkupFeeStablecoinRaw = multiplyByPowerOfTen(partnerMarkupFeeUSD, stablecoinDecimals).toFixed(0, 0);

  const transfers = [];

  if (new Big(networkFeeStablecoinRaw).gt(0)) {
    transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, networkFeeStablecoinRaw));
  }

  if (new Big(vortexFeeStablecoinRaw).gt(0)) {
    // If PEN buyback is enabled, create swap transaction on Zenlink DEX
    const vortexFeePenPercentage = quote.metadata.fees?.vortexFeePenPercentage;
    if (vortexFeePenPercentage && vortexFeePenPercentage > 0) {
      const vortexFeePenStablecoinRaw = new Big(vortexFeeStablecoinRaw).mul(vortexFeePenPercentage / 100).toFixed(0, 0);

      const vortexFeeStablecoinAfterPenRaw = new Big(vortexFeeStablecoinRaw).minus(vortexFeePenStablecoinRaw).toFixed(0, 0);

      // Choose a deadline incredibly far in the future to avoid transaction failure due to deadline expiration
      const deadline = 1_000_000_000;
      // Set to 1 to accept any amount of stablecoin in return
      const amountOutMin = 1;

      const penZenlinkId = getZenlinkIdForAsset("PEN");
      const usdcZenlinkId = getZenlinkIdForAsset(stablecoinDetails.assetSymbol);

      const recipient = {
        Id: vortexPayoutAddress
      };

      if (penZenlinkId && usdcZenlinkId) {
        transfers.push(
          api.tx.zenlinkProtocol.swapExactAssetsForAssets(
            vortexFeePenStablecoinRaw,
            amountOutMin,
            [usdcZenlinkId, penZenlinkId],
            recipient,
            deadline
          )
        );
      } else {
        logger.warn(`Could not find Zenlink IDs for 'PEN' or ${stablecoinDetails.assetSymbol}, skipping PEN buyback swap`);
      }
      transfers.push(
        api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinAfterPenRaw)
      );
    } else {
      transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinRaw));
    }
  }

  if (new Big(partnerMarkupFeeStablecoinRaw).gt(0) && partnerPayoutAddress) {
    transfers.push(api.tx.tokens.transferKeepAlive(partnerPayoutAddress, stablecoinCurrencyId, partnerMarkupFeeStablecoinRaw));
  }

  if (transfers.length > 0) {
    const batchTx = api.tx.utility.batchAll(transfers);
    // Create unsigned transaction (don't sign it here)
    return encodeSubmittableExtrinsic(batchTx);
  }

  return null;
}

/**
 * Adds fee distribution transaction if available.
 * Shared between onramp and offramp flows.
 *
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
  const feeDistributionTx = await createFeeDistributionTransaction(quote);

  if (feeDistributionTx) {
    unsignedTxs.push({
      meta: {},
      network: Networks.Pendulum,
      nonce: nextNonce,
      phase: "distributeFees",
      signer: account.address,
      txData: feeDistributionTx
    });
    nextNonce++;
  }

  return nextNonce;
}
