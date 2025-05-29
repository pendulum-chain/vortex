import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
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
} from 'shared';
import Big from 'big.js';
import { PENDULUM_USDC_ASSETHUB, PENDULUM_USDC_AXL } from 'shared/src/tokens/constants/pendulum';
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
import { priceFeedService } from '../priceFeed.service';

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase
 * @param quote The quote ticket
 * @returns The encoded transaction
 */
async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
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
  const vortexPartner = await Partner.findOne({ where: { name: 'vortex', isActive: true } });
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

/**
 * Creates Moonbeam to Pendulum XCM transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createMoonbeamTransactions(
  params: {
    pendulumEphemeralAddress: string;
    inputAmountPostAnchorFeeRaw: string;
    inputTokenDetails: any;
    account: AccountMeta;
    toNetworkId: number;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number,
): Promise<number> {
  const { pendulumEphemeralAddress, inputAmountPostAnchorFeeRaw, inputTokenDetails, account, toNetworkId } = params;

  // Create and add Moonbeam to Pendulum XCM transaction
  const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
    pendulumEphemeralAddress,
    inputAmountPostAnchorFeeRaw,
    inputTokenDetails.moonbeamErc20Address,
  );

  unsignedTxs.push({
    txData: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
    phase: 'moonbeamToPendulumXcm',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  // Create and add Moonbeam cleanup transaction
  const moonbeamCleanupTransaction = await prepareMoonbeamCleanupTransaction();

  // For assethub, we skip the 2 squidrouter transactions, so nonce is 2 lower.
  // TODO is the moonbeamCleanup nonce too high?
  const moonbeamCleanupNonce =
    toNetworkId === getNetworkId(Networks.AssetHub)
      ? nextNonce + 1 // +1 because we skip squidrouter transactions
      : nextNonce + 3; // +3 because we need to account for squidrouter approve and swap

  unsignedTxs.push({
    txData: encodeSubmittableExtrinsic(moonbeamCleanupTransaction),
    phase: 'moonbeamCleanup',
    network: account.network,
    nonce: moonbeamCleanupNonce,
    signer: account.address,
  });

  return nextNonce;
}

/**
 * Creates Squidrouter transactions for non-AssetHub destinations
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createSquidrouterTransactions(
  params: {
    outputTokenDetails: any;
    toNetwork: Networks;
    rawAmount: string;
    destinationAddress: string;
    account: AccountMeta;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number,
): Promise<number> {
  const { outputTokenDetails, toNetwork, rawAmount, destinationAddress, account } = params;

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.symbol}`);
  }

  const { approveData, swapData } = await createOnrampSquidrouterTransactions({
    outputTokenDetails,
    toNetwork,
    rawAmount,
    addressDestination: destinationAddress,
    fromAddress: account.address,
    moonbeamEphemeralStartingNonce: nextNonce,
  });

  unsignedTxs.push({
    txData: encodeEvmTransactionData(approveData) as any,
    phase: 'squidrouterApprove',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  unsignedTxs.push({
    txData: encodeEvmTransactionData(swapData) as any,
    phase: 'squidrouterSwap',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  return nextNonce;
}

/**
 * Creates Nabla swap transactions for Pendulum
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
async function createNablaSwapTransactions(
  params: {
    inputAmountUnits: Big;
    quote: QuoteTicketAttributes;
    account: AccountMeta;
    inputTokenPendulumDetails: any;
    outputTokenPendulumDetails: any;
    outputTokenDetails: any;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number,
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { inputAmountUnits, quote, account, inputTokenPendulumDetails, outputTokenPendulumDetails } = params;

  // The input amount before the swap is the input amount minus the anchor fee
  const anchorFeeInInputCurrency = quote.fee.anchor; // Already denoted in the input currency
  const inputAmountBeforeSwapRaw = multiplyByPowerOfTen(
    new Big(quote.inputAmount).minus(anchorFeeInInputCurrency),
    inputTokenPendulumDetails.pendulumDecimals,
  ).toFixed(0, 0);

  // For these minimums, we use the output amount after anchor fee deduction but before the other fees are deducted.
  // This is because for onramps, the anchor fee is deducted before the nabla swap.
  const anchorFeeInOutputCurrency = await priceFeedService.convertCurrency(
    quote.fee.anchor,
    quote.inputCurrency,
    quote.outputCurrency,
  );
  const totalFeeInOutputCurrency = await priceFeedService.convertCurrency(
    quote.fee.total,
    quote.inputCurrency,
    quote.outputCurrency,
  );
  const outputAfterAnchorFee = new Big(quote.outputAmount)
    .plus(totalFeeInOutputCurrency)
    .minus(anchorFeeInOutputCurrency);

  const nablaSoftMinimumOutput = outputAfterAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
  const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
    nablaSoftMinimumOutput,
    outputTokenPendulumDetails.pendulumDecimals,
  ).toFixed(0, 0);

  const nablaHardMinimumOutput = outputAfterAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN);
  const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(
    nablaHardMinimumOutput,
    outputTokenPendulumDetails.pendulumDecimals,
  ).toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOnramp(
    inputAmountBeforeSwapRaw,
    account,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
  );

  // Add Nabla approve transaction
  unsignedTxs.push({
    txData: approve.transaction,
    phase: 'nablaApprove',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  // Add Nabla swap transaction
  unsignedTxs.push({
    txData: swap.transaction,
    phase: 'nablaSwap',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      nablaSoftMinimumOutputRaw,
      inputAmountBeforeSwapRaw,
      nabla: {
        approveExtrinsicOptions: approve.extrinsicOptions,
        swapExtrinsicOptions: swap.extrinsicOptions,
      },
    },
  };
}

/**
 * Adds fee distribution transaction if available
 * @param quote Quote ticket
 * @param account Account metadata
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function addFeeDistributionTransaction(
  quote: QuoteTicketAttributes,
  account: AccountMeta,
  unsignedTxs: UnsignedTx[],
  nextNonce: number,
): Promise<number> {
  // Generate the fee distribution transaction
  const feeDistributionTx = await createFeeDistributionTransaction(quote);

  if (feeDistributionTx) {
    unsignedTxs.push({
      txData: feeDistributionTx,
      phase: 'distributeFees',
      network: account.network,
      nonce: nextNonce,
      signer: account.address,
    });
    nextNonce++;
  }

  return nextNonce;
}

/**
 * Creates Pendulum cleanup transaction
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Current Pendulum nonce
 * @returns Cleanup transaction template
 */
async function createPendulumCleanupTx(params: {
  inputTokenPendulumDetails: any;
  outputTokenPendulumDetails: any;
  account: AccountMeta;
}): Promise<Omit<UnsignedTx, 'nonce'>> {
  const { inputTokenPendulumDetails, outputTokenPendulumDetails, account } = params;

  const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
    inputTokenPendulumDetails.pendulumCurrencyId,
    outputTokenPendulumDetails.pendulumCurrencyId,
  );

  return {
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction),
    phase: 'pendulumCleanup',
    network: account.network,
    signer: account.address,
  };
}

/**
 * Creates AssetHub destination transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param pendulumCleanupTx Cleanup transaction template
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createAssetHubDestinationTransactions(
  params: {
    destinationAddress: string;
    outputTokenDetails: any;
    quote: QuoteTicketAttributes;
    account: AccountMeta;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, 'nonce'>,
  nextNonce: number,
): Promise<number> {
  const { destinationAddress, outputTokenDetails, quote, account } = params;

  // Use the final output amount (net of all fees) for the final transfer
  const finalOutputAmountRaw = multiplyByPowerOfTen(
    new Big(quote.outputAmount),
    outputTokenDetails.pendulumDecimals,
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
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  // Add cleanup transaction with the next nonce
  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: nextNonce,
  });
  nextNonce++;

  return nextNonce;
}

/**
 * Creates EVM destination transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param pendulumCleanupTx Cleanup transaction template
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createEvmDestinationTransactions(
  params: {
    moonbeamEphemeralAddress: string;
    outputTokenDetails: any;
    quote: QuoteTicketAttributes;
    account: AccountMeta;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, 'nonce'>,
  nextNonce: number,
): Promise<number> {
  const { moonbeamEphemeralAddress, outputTokenDetails, quote, account } = params;

  const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
    moonbeamEphemeralAddress,
    quote.metadata.onrampOutputAmountMoonbeamRaw,
    outputTokenDetails.pendulumCurrencyId,
  );

  unsignedTxs.push({
    txData: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
    phase: 'pendulumToMoonbeam',
    network: account.network,
    nonce: nextNonce,
    signer: account.address,
  });
  nextNonce++;

  // Add cleanup transaction with the next nonce
  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: nextNonce,
  });
  nextNonce++;

  return nextNonce;
}

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
  taxId: string,
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate network and tokens
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }
  const toNetworkId = getNetworkId(toNetwork);

  // Find required ephemeral accounts
  const pendulumEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error('Pendulum ephemeral not found');
  }

  const moonbeamEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Moonbeam);
  if (!moonbeamEphemeralEntry) {
    throw new Error('Moonbeam ephemeral not found');
  }

  // Validate input token
  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);

  if (!isMoonbeamTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be Moonbeam token for onramp, got ${quote.inputCurrency}`);
  }

  // Validate output token
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency)!;

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }

  // Cast metadata to the correct type for better type safety
  const metadata = quote.metadata as QuoteTicketMetadata;

  // Calculate amounts
  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(
    inputAmountPostAnchorFeeUnits,
    inputTokenDetails.decimals,
  ).toFixed(0, 0);

  const outputAmountBeforeFinalStepRaw = new Big(quote.metadata.onrampOutputAmountMoonbeamRaw).toFixed(0, 0);
  const outputAmountBeforeFinalStepUnits = multiplyByPowerOfTen(
    outputAmountBeforeFinalStepRaw,
    -outputTokenDetails.decimals,
  ).toFixed();

  // Get token details for Pendulum
  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  // Initialize state metadata
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    outputAmountBeforeFinalStep: { units: outputAmountBeforeFinalStepUnits, raw: outputAmountBeforeFinalStepRaw },
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    destinationAddress,
    taxId,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
  };

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // Initialize nonce counter for Moonbeam transactions
      let moonbeamNonce = 0;

      // Create Moonbeam to Pendulum XCM transaction
      moonbeamNonce = await createMoonbeamTransactions(
        {
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          inputAmountPostAnchorFeeRaw,
          inputTokenDetails,
          account,
          toNetworkId,
        },
        unsignedTxs,
        moonbeamNonce,
      );

      // Create Squidrouter transactions for non-AssetHub destinations
      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        await createSquidrouterTransactions(
          {
            outputTokenDetails,
            toNetwork,
            rawAmount: metadata.onrampOutputAmountMoonbeamRaw,
            destinationAddress,
            account,
          },
          unsignedTxs,
          moonbeamNonce,
        );
      }
    }
    // Process Pendulum account
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // Initialize nonce counter for Pendulum transactions
      let pendulumNonce = 0;

      // Create Nabla swap transactions
      const nablaResult = await createNablaSwapTransactions(
        {
          inputAmountUnits: inputAmountPostAnchorFeeUnits,
          quote,
          account,
          inputTokenPendulumDetails,
          outputTokenPendulumDetails,
          outputTokenDetails,
        },
        unsignedTxs,
        pendulumNonce,
      );

      // Update nonce and state metadata
      pendulumNonce = nablaResult.nextNonce;
      stateMeta = {
        ...stateMeta,
        ...nablaResult.stateMeta,
      };

      // Add fee distribution transaction
      pendulumNonce = await addFeeDistributionTransaction(quote, account, unsignedTxs, pendulumNonce);

      // Create cleanup transaction template
      const pendulumCleanupTx = await createPendulumCleanupTx({
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        account,
      });

      // Create destination-specific transactions
      if (toNetworkId === getNetworkId(Networks.AssetHub)) {
        // Create AssetHub destination transactions
        await createAssetHubDestinationTransactions(
          {
            destinationAddress,
            outputTokenDetails,
            quote,
            account,
          },
          unsignedTxs,
          pendulumCleanupTx,
          pendulumNonce,
        );
      } else {
        // Create EVM destination transactions
        if (!moonbeamEphemeralEntry) {
          throw new Error('prepareOnrampTransactions: Moonbeam ephemeral not found');
        }

        await createEvmDestinationTransactions(
          {
            moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
            outputTokenDetails,
            quote,
            account,
          },
          unsignedTxs,
          pendulumCleanupTx,
          pendulumNonce,
        );
      }
    }
  }

  return { unsignedTxs, stateMeta };
}
