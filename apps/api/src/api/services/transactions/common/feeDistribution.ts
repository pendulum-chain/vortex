import {
  AccountMeta,
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  ApiManager,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  encodeSubmittableExtrinsic,
  evmTokenConfig,
  getNetworkFromDestination,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  RampDirection,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData } from "viem/utils";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import erc20ABI from "../../../../contracts/ERC20";
import { QuoteTicketAttributes } from "../../../../models/quoteTicket.model";
import { findPartnerWithPricing } from "../../partners/partner-pricing.service";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { getTargetFiatCurrency } from "../../quote/core/helpers";
import { getZenlinkIdForAsset } from "../../zenlink";

function getQuotePricingPartnerId(quote: QuoteTicketAttributes): string | null {
  return quote.pricingPartnerId ?? quote.partnerId ?? null;
}

function getQuoteFiatCurrency(quote: QuoteTicketAttributes) {
  return getTargetFiatCurrency(quote.rampType, quote.inputCurrency, quote.outputCurrency);
}

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase.
 * This is shared between onramp and offramp flows.
 *
 * @param quote The quote ticket
 * @returns The encoded transaction or null if no fees to distribute
 */
export async function createSubstrateFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
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
  const vortexPartner = await findPartnerWithPricing({ name: "vortex" }, quote.rampType, getQuoteFiatCurrency(quote));
  if (!vortexPartner) {
    logger.error(
      "FEE DISTRIBUTION FAILED: No active 'vortex' partner found for rampType=" +
        quote.rampType +
        ". An active partners row named 'vortex' with an active pricing config for this ramp_type MUST exist; otherwise no fees can be collected."
    );
    throw new Error(`Vortex partner row missing for rampType=${quote.rampType}; cannot build fee distribution transaction.`);
  }
  if (!vortexPartner.payoutAddressSubstrate) {
    logger.error(
      "FEE DISTRIBUTION FAILED: 'payout_address_substrate' is not set on the 'vortex' pricing config (rampType=" +
        quote.rampType +
        "). This column MUST be set to a Pendulum address; otherwise no substrate fees can be collected."
    );
    throw new Error(
      `Vortex partner is missing payout_address_substrate (rampType=${quote.rampType}); cannot build fee distribution transaction.`
    );
  }
  const vortexPayoutAddress = vortexPartner.payoutAddressSubstrate;

  const pricingPartnerId = getQuotePricingPartnerId(quote);
  let partnerPayoutAddress = null;
  if (pricingPartnerId) {
    const quotePartner = await findPartnerWithPricing({ id: pricingPartnerId }, quote.rampType, getQuoteFiatCurrency(quote));
    if (quotePartner?.payoutAddressSubstrate) {
      partnerPayoutAddress = quotePartner.payoutAddressSubstrate;
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
  const feeDistributionTx = await createSubstrateFeeDistributionTransaction(quote);

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

/**
 * Resolves the EVM payout addresses for a quote's fee distribution: the vortex payout
 * address (with the DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS fallback) and the pricing
 * partner's payout address when one is configured. Shared between the Base (USDC)
 * and Alfredpay/Polygon (USDT) distribution builders.
 */
async function resolveEvmFeePayoutAddresses(
  quote: QuoteTicketAttributes
): Promise<{ vortexPayoutAddress: string; partnerPayoutAddressEvm: string | null }> {
  const vortexPartner = await findPartnerWithPricing({ name: "vortex" }, quote.rampType, getQuoteFiatCurrency(quote));
  if (!vortexPartner) {
    logger.error(
      "EVM FEE DISTRIBUTION FAILED: No active 'vortex' partner found for rampType=" +
        quote.rampType +
        ". An active partners row named 'vortex' with an active pricing config for this ramp_type MUST exist; otherwise no fees can be collected."
    );
    throw new Error(
      `Vortex partner row missing for rampType=${quote.rampType}; cannot build EVM fee distribution transaction.`
    );
  }
  if (!vortexPartner.payoutAddressEvm) {
    const fallback = config.defaults.vortexEvmPayoutAddress;
    if (!fallback) {
      logger.error(
        "EVM FEE DISTRIBUTION FAILED: 'payout_address_evm' is not set on the 'vortex' pricing config (rampType=" +
          quote.rampType +
          ") and DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS env var is not configured. Set one to avoid losing fees."
      );
      throw new Error(
        `Vortex partner is missing payout_address_evm (rampType=${quote.rampType}) and no DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS fallback configured; cannot build EVM fee distribution transaction.`
      );
    }
    logger.warn(
      `EVM FEE DISTRIBUTION: vortex pricing config (rampType=${quote.rampType}) has no payout_address_evm; falling back to DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS=${fallback}.`
    );
  }
  const vortexPayoutAddress = vortexPartner.payoutAddressEvm ?? (config.defaults.vortexEvmPayoutAddress as string);

  // Look up partner EVM payout address for markup split
  const pricingPartnerId = getQuotePricingPartnerId(quote);
  let partnerPayoutAddressEvm: string | null = null;
  if (pricingPartnerId) {
    const quotePartner = await findPartnerWithPricing({ id: pricingPartnerId }, quote.rampType, getQuoteFiatCurrency(quote));
    if (quotePartner?.payoutAddressEvm) {
      partnerPayoutAddressEvm = quotePartner.payoutAddressEvm;
    }
  }

  return { partnerPayoutAddressEvm, vortexPayoutAddress };
}

interface EvmFeeTransferSpec {
  amountRaw: string;
  toAddress: string;
}

/**
 * Canonical raw fee components for EVM distribution: network + vortex fees floored to
 * raw units as one bucket, partner markup floored separately. Every consumer of the
 * charged fee total (fee transfers, settlement target, fallback refund, swap sizing)
 * MUST derive it from these components so the amounts reconcile exactly.
 */
export function computeFeeComponentRaws(
  quote: QuoteTicketAttributes,
  decimals: number
): { vortexTotalRaw: string; partnerMarkupRaw: string; totalRaw: string } | null {
  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    return null;
  }

  // Vortex receives network + vortex fees
  const vortexTotalRaw = multiplyByPowerOfTen(new Big(usdFeeStructure.network).plus(usdFeeStructure.vortex), decimals).toFixed(
    0,
    0
  );
  const partnerMarkupRaw = multiplyByPowerOfTen(usdFeeStructure.partnerMarkup, decimals).toFixed(0, 0);

  return {
    partnerMarkupRaw,
    totalRaw: new Big(vortexTotalRaw).plus(partnerMarkupRaw).toFixed(0),
    vortexTotalRaw
  };
}

/**
 * Computes the ERC-20 fee transfers a quote requires, in raw units of the fee token:
 * network + vortex fees to the vortex EVM payout address, partner markup to the pricing
 * partner's EVM payout address. Empty when the quote carries no positive fees; payout
 * addresses are only resolved (and required) then.
 */
async function computeEvmFeeTransfers(quote: QuoteTicketAttributes, decimals: number): Promise<EvmFeeTransferSpec[]> {
  const componentRaws = computeFeeComponentRaws(quote, decimals);
  if (!componentRaws) {
    logger.warn("No USD fee structure found in quote metadata, skipping EVM fee distribution transactions");
    return [];
  }
  const { vortexTotalRaw, partnerMarkupRaw } = componentRaws;

  if (new Big(vortexTotalRaw).lte(0) && new Big(partnerMarkupRaw).lte(0)) {
    return [];
  }

  const { vortexPayoutAddress, partnerPayoutAddressEvm } = await resolveEvmFeePayoutAddresses(quote);

  const transfers: EvmFeeTransferSpec[] = [];
  if (new Big(vortexTotalRaw).gt(0)) {
    transfers.push({ amountRaw: vortexTotalRaw, toAddress: vortexPayoutAddress });
  }
  if (new Big(partnerMarkupRaw).gt(0)) {
    if (!partnerPayoutAddressEvm) {
      // Fail closed: the markup was charged against the user's output, so silently
      // dropping the transfer would strand charged fees on the ephemeral. Quote
      // creation already rejects these routes (requiresEvmPartnerPayout); this guard
      // covers partner config changes between quote and registration.
      throw new Error(
        `EVM FEE DISTRIBUTION: partner markup of ${partnerMarkupRaw} raw units has no recipient for quote ${quote.id} (pricingPartnerId=${getQuotePricingPartnerId(quote) ?? "none"}, ownerPartnerId=${quote.partnerId ?? "none"}, rampType=${quote.rampType}); 'payout_address_evm' is not set on the partner row. Refusing to build a fee distribution that would strand charged fees.`
      );
    }
    transfers.push({ amountRaw: partnerMarkupRaw, toAddress: partnerPayoutAddressEvm });
  }

  return transfers;
}

/**
 * Pushes one unsigned ephemeral-signed ERC-20 transfer per fee transfer spec at
 * consecutive nonces. Plain sequential transfers are used deliberately: Multicall3's
 * `aggregate3` executes calls with the Multicall3 contract as msg.sender, so a batched
 * `transfer` would move the contract's (empty) balance, not the ephemeral's.
 *
 * Fee fields carry the UNBUFFERED estimate: the SDK applies the 3x safety multiplier
 * when signing, so buffering here as well would compound to 9x.
 */
async function pushFeeTransferTxs(
  transfers: EvmFeeTransferSpec[],
  network: EvmNetworks,
  tokenAddress: `0x${string}`,
  signerAddress: string,
  unsignedTxs: UnsignedTx[],
  startingNonce: number
): Promise<number> {
  if (transfers.length === 0) {
    return startingNonce;
  }

  const publicClient = EvmClientManager.getInstance().getClient(network);
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  let nonce = startingNonce;
  for (const transfer of transfers) {
    const transferCallData = encodeFunctionData({
      abi: erc20ABI,
      args: [transfer.toAddress, transfer.amountRaw],
      functionName: "transfer"
    });
    unsignedTxs.push({
      meta: {},
      network,
      nonce: nonce++,
      phase: "distributeFees",
      signer: signerAddress,
      txData: {
        data: transferCallData as `0x${string}`,
        gas: "100000",
        maxFeePerGas: String(maxFeePerGas),
        maxPriorityFeePerGas: String(maxPriorityFeePerGas),
        to: tokenAddress,
        value: "0"
      }
    });
  }
  return nonce;
}

/**
 * Adds EVM fee distribution transactions for Base network (USDC): one plain transfer
 * per fee recipient at consecutive nonces.
 *
 * @param quote Quote ticket
 * @param account Account metadata
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addEvmFeeDistributionTransaction(
  quote: QuoteTicketAttributes,
  account: AccountMeta,
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const baseUsdcConfig = evmTokenConfig[Networks.Base][EvmToken.USDC];
  if (!baseUsdcConfig) {
    logger.warn("Base USDC configuration not found, skipping EVM fee distribution transactions");
    return nextNonce;
  }

  const transfers = await computeEvmFeeTransfers(quote, baseUsdcConfig.decimals);
  return pushFeeTransferTxs(
    transfers,
    Networks.Base as EvmNetworks,
    baseUsdcConfig.erc20AddressSourceChain as `0x${string}`,
    account.address,
    unsignedTxs,
    nextNonce
  );
}

/**
 * Canonical total vortex + network + partner-markup fee for a quote in raw Alfredpay
 * USDT units (6 decimals): the component-wise sum used by the distributeFees transfers,
 * so settlement targets and fallback refunds reconcile with the transfers exactly.
 * "0" when the quote carries no positive fees.
 */
export function getAlfredpayFeeTotalRaw(quote: QuoteTicketAttributes): string {
  const componentRaws = computeFeeComponentRaws(quote, ALFREDPAY_ERC20_DECIMALS);
  if (!componentRaws || new Big(componentRaws.totalRaw).lte(0)) {
    return "0";
  }
  return componentRaws.totalRaw;
}

/**
 * Adds Polygon fee distribution transactions for the Alfredpay corridors (USDT).
 * Returns the next free nonce and the raw USDT total the pushed transfers move (the fee
 * amount the ephemeral must retain after the user-facing legs).
 */
export async function addAlfredpayFeeDistributionTransactions(
  quote: QuoteTicketAttributes,
  signerAddress: string,
  unsignedTxs: UnsignedTx[],
  startingNonce: number
): Promise<{ nextNonce: number; distributedFeeRaw: string }> {
  const transfers = await computeEvmFeeTransfers(quote, ALFREDPAY_ERC20_DECIMALS);
  const nextNonce = await pushFeeTransferTxs(
    transfers,
    Networks.Polygon as EvmNetworks,
    ALFREDPAY_ERC20_TOKEN,
    signerAddress,
    unsignedTxs,
    startingNonce
  );

  const distributedFeeRaw = transfers.reduce((total, transfer) => total.plus(transfer.amountRaw), new Big(0));
  return { distributedFeeRaw: distributedFeeRaw.toFixed(0), nextNonce };
}
