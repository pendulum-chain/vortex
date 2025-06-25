import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  AccountMeta,
  EvmTokenDetails,
  EvmTransactionData,
  FiatToken,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  UnsignedTx,
  encodeSubmittableExtrinsic,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isAssetHubToken,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
} from '@packages/shared';
import Big from 'big.js';
import { http, createPublicClient, encodeFunctionData } from 'viem';
import { polygon } from 'viem/chains';
import logger from '../../../config/logger';
import erc20ABI from '../../../contracts/ERC20';
import Partner from '../../../models/partner.model';
import { QuoteTicketAttributes, QuoteTicketMetadata } from '../../../models/quoteTicket.model';
import { getMoneriumEvmDefaultMintAddress } from '../monerium';
import { ApiManager } from '../pendulum/apiManager';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { StateMetadata } from '../phases/meta-state-types';
import { priceFeedService } from '../priceFeed.service';
import { encodeEvmTransactionData } from './index';
import { prepareMoonbeamCleanupTransaction } from './moonbeam/cleanup';
import { createNablaTransactionsForOnramp } from './nabla';
import { preparePendulumCleanupTransaction } from './pendulum/cleanup';
import { createOfframpSquidrouterTransactionsToEvm } from './squidrouter/offramp';
import { createOnrampSquidrouterTransactions, createOnrampSquidrouterTransactionsToEvm } from './squidrouter/onramp';
import { createMoonbeamToPendulumXCM } from './xcm/moonbeamToPendulum';
import { createPendulumToAssethubTransfer } from './xcm/pendulumToAssethub';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';

export const ERC20_EURE_POLYGON: `0x${string}` = '0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6'; // EUR.e on Polygon
/**
 * TODO: implement for Monerium prototype?
 */
async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  return '';
}

export interface MoneriumOnrampTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  destinationAddress: string;
  moneriumAuthToken: string;
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
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareMoneriumEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  moneriumAuthToken,
}: MoneriumOnrampTransactionParams): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate network and tokens
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }
  const toNetworkId = getNetworkId(toNetwork);

  // Validate input token. Only EURC is allowed for onramp, through Monerium.
  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);

  // Validate output token
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency)!;

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }
  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for onramp.`);
  }

  const userMintAddress = await getMoneriumEvmDefaultMintAddress(moneriumAuthToken);
  if (!userMintAddress) {
    throw new Error('User mint address not found for Monerium onramp');
  }

  // Find required ephemeral accounts
  // We use Moonbeam as the generic EVM chain.
  const polygonEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Moonbeam);
  if (!polygonEphemeralEntry) {
    throw new Error('Polygon ephemeral not found');
  }
  // Cast metadata to the correct type for better type safety
  const metadata = quote.metadata as QuoteTicketMetadata;

  // Calculate amounts
  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFeeUnits, 18).toFixed(0, 0);

  const outputAmountBeforeFinalStepRaw = new Big(quote.metadata.onrampOutputAmountMoonbeamRaw).toFixed(0, 0);
  const outputAmountBeforeFinalStepUnits = multiplyByPowerOfTen(
    outputAmountBeforeFinalStepRaw,
    -outputTokenDetails.decimals,
  ).toFixed();

  // Initialize state metadata
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    outputAmountBeforeFinalStep: {
      units: outputAmountBeforeFinalStepUnits,
      raw: outputAmountBeforeFinalStepRaw,
    },
    polygonEphemeralAddress: polygonEphemeralEntry.address,
    destinationAddress,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
  };

  // Create initial user transaction that approves minted funds to ephemeral.
  const initialTransferTxData = await createOnrampUserApprove(
    inputAmountPostAnchorFeeRaw,
    polygonEphemeralEntry.address,
  );

  unsignedTxs.push({
    txData: encodeEvmTransactionData(initialTransferTxData) as any,
    phase: 'moneriumOnrampSelfTransfer',
    network: Networks.Polygon,
    nonce: 0,
    signer: userMintAddress,
  });

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    // Create transactions for ephemeral account where Monerium minting takes place
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // Initialize nonce counter for Polygon transactions
      let polygonAccountNonce = 3; // TODO TESTING, should be 0.

      const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
        inputAmountPostAnchorFeeRaw,
        userMintAddress,
        polygonEphemeralEntry.address,
      );

      unsignedTxs.push({
        txData: encodeEvmTransactionData(polygonSelfTransferTxData) as any,
        phase: 'moneriumOnrampSelfTransfer',
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        signer: account.address,
      });

      const { approveData, swapData } = await createOnrampSquidrouterTransactionsToEvm({
        fromAddress: account.address,
        rawAmount: inputAmountPostAnchorFeeRaw,
        outputTokenDetails,
        inputTokenDetails: {
          erc20AddressSourceChain: ERC20_EURE_POLYGON,
        } as unknown as EvmTokenDetails, // Always EUR.e for Monerium onramp.
        fromNetwork: Networks.Polygon, // By design, EURC onramp starts from Polygon.
        toNetwork,
        destinationAddress,
      });

      unsignedTxs.push({
        txData: encodeEvmTransactionData(approveData) as any,
        phase: 'squidRouterApprove',
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        signer: account.address,
      });

      unsignedTxs.push({
        txData: encodeEvmTransactionData(swapData) as any,
        phase: 'squidRouterSwap',
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        signer: account.address,
      });
    }
  }

  return { unsignedTxs, stateMeta };
}

async function createOnrampUserApprove(amountRaw: string, toAddress: string): Promise<EvmTransactionData> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
  });

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [toAddress, amountRaw],
  });

  const { maxFeePerGas } = await publicClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    to: ERC20_EURE_POLYGON,
    data: transferCallData as `0x${string}`,
    value: '0',
    gas: '100000',
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
  };

  return txData;
}

async function createOnrampEphemeralSelfTransfer(
  amountRaw: string,
  fromAddress: string,
  toAddress: string,
): Promise<EvmTransactionData> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
  });

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'transferFrom',
    args: [fromAddress, toAddress, amountRaw],
  });

  const { maxFeePerGas } = await publicClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    to: ERC20_EURE_POLYGON as `0x${string}`,
    data: transferCallData as `0x${string}`,
    value: '0',
    gas: '100000',
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
  };

  return txData;
}
