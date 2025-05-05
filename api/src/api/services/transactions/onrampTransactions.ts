import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  encodeSubmittableExtrinsic,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
  Networks,
  UnsignedTx,
  RampCurrency,
  RampPhase,
} from 'shared';
import Big from 'big.js';
import { PENDULUM_USDC_AXL, PENDULUM_USDC_ASSETHUB } from 'shared/src/tokens/constants/pendulum';
import Partner from '../../../models/partner.model';
import { ApiManager } from '../pendulum/apiManager';
import { QuoteTicketAttributes, QuoteTicketMetadata } from '../../../models/quoteTicket.model';
import { encodeEvmTransactionData } from './index';
import { createOnrampSquidrouterTransactions } from './squidrouter/onramp';
import { createMoonbeamToPendulumXCM } from './xcm/moonbeamToPendulum';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { createPendulumToAssethubTransfer } from './xcm/pendulumToAssethub';
import { createNablaTransactionsForOnramp } from './nabla';
import { preparePendulumCleanupTransaction } from './pendulum/cleanup';
import { prepareMoonbeamCleanupTransaction } from './moonbeam/cleanup';
import { StateMetadata } from '../phases/meta-state-types';
import logger from '../../../config/logger';

// TODO: Implement proper Fiat to USD conversion using price feeds
function convertFiatToUSD(amountFiat: string, sourceFiat: RampCurrency): string {
  logger.warn(`TODO: Implement ${sourceFiat} to USD conversion. Using placeholder logic.`);
  // Placeholder: Returns original fiat amount. Needs real implementation.
  const usdLikeCurrencies = ['USD', 'USDC', 'axlUSDC'];
  if (usdLikeCurrencies.includes(sourceFiat as string)) return amountFiat; // Base case
  return amountFiat;
}

// TODO: Implement USD to Token Units conversion using price feeds
function convertUSDToTokenUnits(amountUSD: string, tokenDetails: { decimals: number /* Add price info if available */ }): string {
  logger.warn(`TODO: Implement USD to token units conversion for token with decimals ${tokenDetails.decimals}. Using placeholder 1:1 conversion.`);
  // Placeholder: Assumes 1 USD = 1 token unit, adjusts for decimals. Needs real price.
  const amountUnits = new Big(amountUSD);
  return multiplyByPowerOfTen(amountUnits, tokenDetails.decimals).toFixed(0, 0);
}

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase
 * @param quote The quote ticket
 * @returns The encoded transaction
 */
async function createFeeDistributionTransaction(
  quote: QuoteTicketAttributes,
): Promise<string | null> {
  // Get the API instance
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi('pendulum');

  // Get the metadata with USD fee structure
  const metadata = quote.metadata as QuoteTicketMetadata;
  if (!metadata.usdFeeStructure) {
    logger.warn('No USD fee structure found in quote metadata, skipping fee distribution transaction');
    return null;
  }

  // Read fee components from metadata.usdFeeStructure
  const networkFeeUSD = metadata.usdFeeStructure.network;
  const vortexFeeUSD = metadata.usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = metadata.usdFeeStructure.partnerMarkup;

  // Get payout addresses
  const vortexPartner = await Partner.findOne({ where: { name: 'vortex_foundation', isActive: true } });
  if (!vortexPartner || !vortexPartner.payoutAddress) {
    logger.warn('Vortex partner or payout address not found, skipping fee distribution transaction');
    return null;
  }
  const vortexPayoutAddress = vortexPartner.payoutAddress;

  let partnerPayoutAddress = null;
  if (quote.partnerId) {
    const quotePartner = await Partner.findOne({ where: { id: quote.partnerId, isActive: true } });
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
  const stablecoinCurrencyId = stablecoinDetails.pendulumCurrencyId;
  const stablecoinDecimals = stablecoinDetails.pendulumDecimals;

  // Convert USD fees to stablecoin raw units
  const networkFeeStablecoinRaw = convertUSDToTokenUnits(networkFeeUSD, { decimals: stablecoinDecimals });
  const vortexFeeStablecoinRaw = convertUSDToTokenUnits(vortexFeeUSD, { decimals: stablecoinDecimals });
  const partnerMarkupFeeStablecoinRaw = convertUSDToTokenUnits(partnerMarkupFeeUSD, { decimals: stablecoinDecimals });

  // Build transfers
  const transfers = [];

  if (new Big(networkFeeStablecoinRaw).gt(0)) {
    transfers.push(
      api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, networkFeeStablecoinRaw),
    );
  }

  if (new Big(vortexFeeStablecoinRaw).gt(0)) {
    transfers.push(
      api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinRaw),
    );
  }

  if (new Big(partnerMarkupFeeStablecoinRaw).gt(0) && partnerPayoutAddress) {
    transfers.push(
      api.tx.tokens.transferKeepAlive(partnerPayoutAddress, stablecoinCurrencyId, partnerMarkupFeeStablecoinRaw),
    );
  }

  // Create batch transaction
  if (transfers.length > 0) {
    const batchTx = api.tx.utility.batchAll(transfers);
    // Create unsigned transaction (don't sign it here)
    return encodeSubmittableExtrinsic(batchTx);
  }

  return null;
}

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
  taxId: string,
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }
  const toNetworkId = getNetworkId(toNetwork);

  // ensure we have Pendulum, Moonbeam ephemerals
  const pendulumEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error('Pendulum ephemeral not found');
  }

  const moonbeamEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Moonbeam);
  if (!moonbeamEphemeralEntry) {
    throw new Error('Moonbeam ephemeral not found');
  }

  // validate input token. At this point should be validated by the quote endpoint,
  // but we need it for the type check
  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);

  if (!isMoonbeamTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be Moonbeam token for onramp, got ${quote.inputCurrency}`);
  }
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency)!;

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }

  // Cast metadata to the correct type for better type safety
  const metadata = quote.metadata as QuoteTicketMetadata;
  
  // Get the original input amount before anchor fee deduction
  const originalInputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);
  
  // Use placeholder values if the metadata properties don't exist
  // These properties might not be defined in the current QuoteTicketMetadata type
  // but are expected to be added in the future
  const anchorFeeFiat = '0'; // This would come from metadata.anchorFeeFiat
  const targetFiat = 'USDC' as RampCurrency; // This would come from metadata.targetFiat
  
  // Convert anchor fee from fiat to USD
  const anchorFeeUSD = convertFiatToUSD(anchorFeeFiat, targetFiat);
  
  // Convert anchor fee from USD to input token units
  const anchorFeeInInputTokenRaw = convertUSDToTokenUnits(anchorFeeUSD, inputTokenDetails);
  
  // Calculate input amount after anchor fee deduction
  const inputAmountPostAnchorFeeRaw = new Big(originalInputAmountRaw).minus(anchorFeeInInputTokenRaw).toFixed(0, 0);
  const inputAmountPostAnchorFeeUnits = multiplyByPowerOfTen(new Big(inputAmountPostAnchorFeeRaw), -inputTokenDetails.decimals);
  
  // Use the input amount after anchor fee for the swap
  const inputAmountUnits = inputAmountPostAnchorFeeUnits;

  // The output amount to be obtained on Moonbeam, differs from the amount to be obtained on destination evm chain.
  // We'll use the gross output amount (before fee deduction) for swap calculations
  const grossOutputAmountPendulumUnits = new Big(metadata.grossOutputAmount || '0');
  
  // Convert gross output to raw units for Moonbeam
  const outputAmountRaw = multiplyByPowerOfTen(
    grossOutputAmountPendulumUnits,
    outputTokenDetails.pendulumDecimals
  ).toFixed(0, 0);
  
  // Use the gross output amount for swap calculations
  const outputAmount = grossOutputAmountPendulumUnits;

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  // add common data to state metadata, for later use on the executors
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    outputAmountBeforeFees: { units: outputAmount.toFixed(), raw: outputAmountRaw },
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    destinationAddress,
    taxId,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
    inputAmountBeforeSwapRaw: inputAmountPostAnchorFeeRaw,
  };

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      const moonbeamEphemeralStartingNonce = 0;
      const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
        pendulumEphemeralEntry.address,
        inputAmountPostAnchorFeeRaw,
        inputTokenDetails.moonbeamErc20Address,
      );
      unsignedTxs.push({
        txData: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
        phase: 'moonbeamToPendulumXcm',
        network: account.network,
        nonce: moonbeamEphemeralStartingNonce,
        signer: account.address,
      });

      const moonbeamCleanupTransaction = await prepareMoonbeamCleanupTransaction();
      // For assethub, we skip the 2 squidrouter transactions, so nonce is 2 lower.
      const moonbeamCleanupStartingNonce = toNetworkId === getNetworkId(Networks.AssetHub) ? moonbeamEphemeralStartingNonce + 2 : moonbeamEphemeralStartingNonce + 4;
      unsignedTxs.push({
        txData: encodeSubmittableExtrinsic(moonbeamCleanupTransaction),
        phase: 'moonbeamCleanup',
        network: account.network,
        nonce: moonbeamCleanupStartingNonce,
        signer: account.address,
      });

      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        if (!isEvmTokenDetails(outputTokenDetails)) {
          throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${quote.outputCurrency}`);
        }
        const { approveData, swapData } = await createOnrampSquidrouterTransactions({
          outputTokenDetails,
          toNetwork,
          rawAmount: outputAmountRaw,
          addressDestination: destinationAddress,
          fromAddress: account.address,
          moonbeamEphemeralStartingNonce: moonbeamEphemeralStartingNonce + 2,
        });

        unsignedTxs.push({
          txData: encodeEvmTransactionData(approveData) as any,
          phase: 'squidrouterApprove',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 2,
          signer: account.address,
        });
        unsignedTxs.push({
          txData: encodeEvmTransactionData(swapData) as any,
          phase: 'squidrouterSwap',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 3,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // Calculate the soft minimum output based on the gross output amount
      const nablaSoftMinimumOutput = grossOutputAmountPendulumUnits.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
      const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
        nablaSoftMinimumOutput,
        outputTokenDetails.pendulumDecimals,
      ).toFixed();

      const { approveTransaction, swapTransaction } = await createNablaTransactionsForOnramp(
        inputAmountUnits,
        quote,
        account,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
      );

      unsignedTxs.push({
        txData: approveTransaction,
        phase: 'nablaApprove',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        txData: swapTransaction,
        phase: 'nablaSwap',
        network: account.network,
        nonce: 1,
        signer: account.address,
      });

      // Generate the fee distribution transaction
      const feeDistributionTx = await createFeeDistributionTransaction(quote);
      if (feeDistributionTx) {
        unsignedTxs.push({
          txData: feeDistributionTx,
          phase: 'distributeFees',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }

      stateMeta = {
        ...stateMeta,
        nablaSoftMinimumOutputRaw,
      };

      const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
        inputTokenPendulumDetails.pendulumCurrencyId,
        outputTokenPendulumDetails.pendulumCurrencyId,
      );

      unsignedTxs.push({
        txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction),
        phase: 'pendulumCleanup',
        network: account.network,
        nonce: 4, // Will always come after either pendulumToMoonbeam or pendulumToAssethub, and possibly distributeFees
        signer: account.address,
      });

      if (toNetworkId === getNetworkId(Networks.AssetHub)) {
        // Use the final output amount (net of all fees) for the final transfer
        const finalOutputAmountRaw = multiplyByPowerOfTen(
          new Big(quote.outputAmount),
          outputTokenDetails.pendulumDecimals
        ).toFixed(0, 0);
        
        const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
          destinationAddress,
          outputTokenDetails.pendulumCurrencyId,
          finalOutputAmountRaw,
        );
        unsignedTxs.push({
          txData: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction),
          phase: 'pendulumToAssethub',
          network: account.network,
          nonce: 3,
          signer: account.address,
        });
      } else {
        if (!moonbeamEphemeralEntry) {
          throw new Error('prepareOnrampTransactions: Moonbeam ephemeral not found');
        }

        // Use the final output amount (net of all fees) for the final transfer
        const finalOutputAmountRaw = multiplyByPowerOfTen(
          new Big(quote.outputAmount),
          outputTokenDetails.pendulumDecimals
        ).toFixed(0, 0);
        
        const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
          moonbeamEphemeralEntry.address,
          finalOutputAmountRaw,
          outputTokenDetails.pendulumCurrencyId,
        );
        unsignedTxs.push({
          txData: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
          phase: 'pendulumToMoonbeam',
          network: account.network,
          nonce: 3,
          signer: account.address,
        });
      }
    }
  }

  return { unsignedTxs, stateMeta };
}
