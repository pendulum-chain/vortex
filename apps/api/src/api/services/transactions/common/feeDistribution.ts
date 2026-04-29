import {
  AccountMeta,
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
import erc20ABI from "../../../../contracts/ERC20";
import { MULTICALL3_ADDRESS, multicall3ABI } from "../../../../contracts/Multicall3";
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

  // Get vortex payout address (EVM)
  const vortexPartner = await Partner.findOne({
    where: { isActive: true, name: "vortex", rampType: quote.rampType }
  });
  if (!vortexPartner || !vortexPartner.payoutAddressEvm) {
    logger.warn("Vortex partner or EVM payout address not found, skipping EVM fee distribution transaction");
    return null;
  }
  const vortexPayoutAddress = vortexPartner.payoutAddressEvm;

  // Look up partner EVM payout address for markup split
  let partnerPayoutAddressEvm: string | null = null;
  if (quote.partnerId) {
    const quotePartner = await Partner.findOne({
      where: { id: quote.partnerId, isActive: true, rampType: quote.rampType }
    });
    if (quotePartner?.payoutAddressEvm) {
      partnerPayoutAddressEvm = quotePartner.payoutAddressEvm;
    }
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
      phase: "distributeFeesEvm",
      signer: account.address,
      txData: feeDistributionTx
    });
    nextNonce++;
  }

  return nextNonce;
}
