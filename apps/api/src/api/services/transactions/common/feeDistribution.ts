import {
  AccountMeta,
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  ApiManager,
  EvmClientManager,
  EvmToken,
  EvmTransactionData,
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
import { MULTICALL3_ADDRESS, multicall3ABI } from "../../../../contracts/Multicall3";
import { QuoteTicketAttributes } from "../../../../models/quoteTicket.model";
import { findPartnerWithPricing } from "../../partners/partner-pricing.service";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { getTargetFiatCurrency } from "../../quote/core/helpers";
import { getZenlinkIdForAsset } from "../../zenlink";
import { addOnrampDestinationChainTransactions } from "../onramp/common/transactions";

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

/**
 * Creates an EVM fee distribution transaction for Base network.
 * Splits fees: network + vortex fees go to vortex EVM payout address,
 * partner markup goes to partner EVM payout address (if available).
 * Uses Multicall3 to batch multiple ERC20 transfers when needed.
 *
 * @param quote The quote ticket
 * @returns The EVM transaction data or null if no fees to distribute
 */
export async function createEvmFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<EvmTransactionData | null> {
  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    logger.warn("No USD fee structure found in quote metadata, skipping EVM fee distribution transaction");
    return null;
  }

  const networkFeeUSD = usdFeeStructure.network;
  const vortexFeeUSD = usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = usdFeeStructure.partnerMarkup;

  const { vortexPayoutAddress, partnerPayoutAddressEvm } = await resolveEvmFeePayoutAddresses(quote);

  if (Big(partnerMarkupFeeUSD).gt(0) && partnerPayoutAddressEvm === null) {
    logger.warn(
      `EVM FEE DISTRIBUTION: partner markup of ${partnerMarkupFeeUSD.toString()} USD will be DROPPED for quote ${quote.id} (pricingPartnerId=${getQuotePricingPartnerId(quote) ?? "none"}, ownerPartnerId=${quote.partnerId ?? "none"}, rampType=${quote.rampType}); 'payout_address_evm' is not set on the partner row.`
    );
  }

  // Use Base USDC for decimal calculations
  const baseUsdcConfig = evmTokenConfig[Networks.Base][EvmToken.USDC];
  if (!baseUsdcConfig) {
    logger.warn("Base USDC configuration not found, skipping EVM fee distribution transaction");
    return null;
  }

  const decimals = baseUsdcConfig.decimals;
  const usdcAddress = baseUsdcConfig.erc20AddressSourceChain;

  // Convert USD fees to USDC raw units
  const networkFeeUsdcRaw = multiplyByPowerOfTen(networkFeeUSD, decimals);
  const vortexFeeUsdcRaw = multiplyByPowerOfTen(vortexFeeUSD, decimals);
  const partnerMarkupFeeUsdcRaw = multiplyByPowerOfTen(partnerMarkupFeeUSD, decimals);

  // Vortex receives network + vortex fees
  const vortexTotalUsdcRaw = networkFeeUsdcRaw.plus(vortexFeeUsdcRaw);
  const hasVortexFees = vortexTotalUsdcRaw.gt(0);
  const hasPartnerFees = partnerMarkupFeeUsdcRaw.gt(0) && partnerPayoutAddressEvm !== null;

  if (!hasVortexFees && !hasPartnerFees) {
    logger.warn("No fees to distribute, skipping EVM fee distribution transaction");
    return null;
  }

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(Networks.Base);
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  // If only vortex fees (no partner split), use a direct ERC20 transfer
  if (hasVortexFees && !hasPartnerFees) {
    const transferCallData = encodeFunctionData({
      abi: erc20ABI,
      args: [vortexPayoutAddress, vortexTotalUsdcRaw.toFixed(0)],
      functionName: "transfer"
    });

    logger.debug(`EVM fee distribution (vortex only): ${vortexTotalUsdcRaw.toFixed(0)} to ${vortexPayoutAddress}`);

    return {
      data: transferCallData as `0x${string}`,
      gas: "100000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: usdcAddress,
      value: "0"
    };
  }

  // Build Multicall3 calls for split distribution
  const calls: { target: `0x${string}`; allowFailure: boolean; callData: `0x${string}` }[] = [];

  if (hasVortexFees) {
    calls.push({
      allowFailure: false,
      callData: encodeFunctionData({
        abi: erc20ABI,
        args: [vortexPayoutAddress, vortexTotalUsdcRaw.toFixed(0)],
        functionName: "transfer"
      }) as `0x${string}`,
      target: usdcAddress as `0x${string}`
    });
  }

  if (hasPartnerFees && partnerPayoutAddressEvm) {
    calls.push({
      allowFailure: false,
      callData: encodeFunctionData({
        abi: erc20ABI,
        args: [partnerPayoutAddressEvm, partnerMarkupFeeUsdcRaw.toFixed(0)],
        functionName: "transfer"
      }) as `0x${string}`,
      target: usdcAddress as `0x${string}`
    });
  }

  const multicallData = encodeFunctionData({
    abi: multicall3ABI,
    args: [calls],
    functionName: "aggregate3"
  });

  logger.debug(
    `EVM fee distribution (split): vortex=${vortexTotalUsdcRaw.toFixed(0)} to ${vortexPayoutAddress}, partner=${partnerMarkupFeeUsdcRaw.toFixed(0)} to ${partnerPayoutAddressEvm}`
  );

  return {
    data: multicallData as `0x${string}`,
    gas: "150000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    to: MULTICALL3_ADDRESS,
    value: "0"
  };
}

/**
 * Adds EVM fee distribution transaction for Base network if available.
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
  const feeDistributionTx = await createEvmFeeDistributionTransaction(quote);

  if (feeDistributionTx) {
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
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
 * Computes the total vortex + network + partner-markup fee for a quote in raw
 * Alfredpay USDT units (6 decimals). "0" when the quote carries no positive fees.
 */
export function getAlfredpayFeeTotalRaw(quote: QuoteTicketAttributes): string {
  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    return "0";
  }

  const totalUsd = new Big(usdFeeStructure.network).plus(usdFeeStructure.vortex).plus(usdFeeStructure.partnerMarkup);
  if (totalUsd.lte(0)) {
    return "0";
  }

  return multiplyByPowerOfTen(totalUsd, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0);
}

/**
 * Adds Polygon fee distribution transactions for the Alfredpay corridors: plain
 * sequential USDT transfers signed by the EVM ephemeral — one for network+vortex fees,
 * one for partner markup when a partner payout address is configured. Multicall3 is
 * deliberately NOT used here: `aggregate3` executes calls with the Multicall3 contract
 * as msg.sender, so a batched `transfer` would move the contract's (empty) balance,
 * not the ephemeral's.
 *
 * Returns the next free nonce and the raw USDT total the pushed transfers move (the fee
 * amount the ephemeral must retain after the user-facing legs).
 */
export async function addAlfredpayFeeDistributionTransactions(
  quote: QuoteTicketAttributes,
  signerAddress: string,
  unsignedTxs: UnsignedTx[],
  startingNonce: number
): Promise<{ nextNonce: number; distributedFeeRaw: string }> {
  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    return { distributedFeeRaw: "0", nextNonce: startingNonce };
  }

  const vortexTotalRaw = multiplyByPowerOfTen(
    new Big(usdFeeStructure.network).plus(usdFeeStructure.vortex),
    ALFREDPAY_ERC20_DECIMALS
  ).toFixed(0, 0);
  const partnerMarkupRaw = multiplyByPowerOfTen(usdFeeStructure.partnerMarkup, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0);

  if (new Big(vortexTotalRaw).lte(0) && new Big(partnerMarkupRaw).lte(0)) {
    return { distributedFeeRaw: "0", nextNonce: startingNonce };
  }

  const { vortexPayoutAddress, partnerPayoutAddressEvm } = await resolveEvmFeePayoutAddresses(quote);

  const transfers: { amountRaw: string; toAddress: string }[] = [];
  if (new Big(vortexTotalRaw).gt(0)) {
    transfers.push({ amountRaw: vortexTotalRaw, toAddress: vortexPayoutAddress });
  }
  if (new Big(partnerMarkupRaw).gt(0)) {
    if (partnerPayoutAddressEvm) {
      transfers.push({ amountRaw: partnerMarkupRaw, toAddress: partnerPayoutAddressEvm });
    } else {
      logger.warn(
        `ALFREDPAY FEE DISTRIBUTION: partner markup of ${usdFeeStructure.partnerMarkup} USD will be DROPPED for quote ${quote.id} (pricingPartnerId=${getQuotePricingPartnerId(quote) ?? "none"}, ownerPartnerId=${quote.partnerId ?? "none"}, rampType=${quote.rampType}); 'payout_address_evm' is not set on the partner row.`
      );
    }
  }

  let nonce = startingNonce;
  let distributedFeeRaw = new Big(0);
  for (const transfer of transfers) {
    const txData = await addOnrampDestinationChainTransactions({
      amountRaw: transfer.amountRaw,
      destinationNetwork: Networks.Polygon,
      toAddress: transfer.toAddress,
      toToken: ALFREDPAY_ERC20_TOKEN
    });
    unsignedTxs.push({
      meta: {},
      network: Networks.Polygon,
      nonce: nonce++,
      phase: "distributeFees",
      signer: signerAddress,
      txData
    });
    distributedFeeRaw = distributedFeeRaw.plus(transfer.amountRaw);
  }

  return { distributedFeeRaw: distributedFeeRaw.toFixed(0), nextNonce: nonce };
}
