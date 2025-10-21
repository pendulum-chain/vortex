import {
  AccountMeta,
  createOnrampSquidrouterTransactionsToEvm,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmClientManager,
  EvmTokenDetails,
  EvmTransactionData,
  FiatToken,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isAssetHubTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import erc20ABI from "../../../contracts/ERC20";
import { QuoteTicketAttributes } from "../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { StateMetadata } from "../phases/meta-state-types";
import { encodeEvmTransactionData } from "./index";

const MONERIUM_MINT_NETWORK = SANDBOX_ENABLED ? Networks.PolygonAmoy : Networks.Polygon;
export interface MoneriumOnrampTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  destinationAddress: string;
}

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareMoneriumEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: MoneriumOnrampTransactionParams): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate network and tokens
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  // Validate input token. Only EURC is allowed for onramp, through Monerium.
  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }

  // Validate output token
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!outputTokenDetails) {
    throw new Error(`Output token details not found for ${quote.outputCurrency} on network ${toNetwork}`);
  }

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }
  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for onramp.`);
  }

  // Find required ephemeral accounts
  // We use Moonbeam as the generic EVM chain.
  const polygonEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Moonbeam);
  if (!polygonEphemeralEntry) {
    throw new Error("Polygon ephemeral not found");
  }

  // Calculate amounts
  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFeeUnits, ERC20_EURE_POLYGON_DECIMALS).toFixed(
    0,
    0
  );

  // Initialize state metadata
  stateMeta = {
    destinationAddress,
    inputAmountBeforeSwapRaw: inputAmountPostAnchorFeeRaw,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
    outputTokenType: quote.outputCurrency,
    polygonEphemeralAddress: polygonEphemeralEntry.address,
    walletAddress: destinationAddress
  };

  // Create initial user transaction that approves minted funds to ephemeral.
  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, polygonEphemeralEntry.address);

  unsignedTxs.push({
    meta: {},
    network: MONERIUM_MINT_NETWORK,
    nonce: 0,
    phase: "moneriumOnrampSelfTransfer",
    signer: destinationAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    // Create transactions for ephemeral account where Monerium minting takes place
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // Initialize nonce counter for Polygon transactions
      let polygonAccountNonce = 0;

      const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
        inputAmountPostAnchorFeeRaw,
        destinationAddress,
        polygonEphemeralEntry.address
      );

      unsignedTxs.push({
        meta: {},
        network: MONERIUM_MINT_NETWORK,
        nonce: polygonAccountNonce++,
        phase: "moneriumOnrampSelfTransfer",
        signer: account.address,
        txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
      });

      const { approveData, swapData, squidRouterQuoteId } = await createOnrampSquidrouterTransactionsToEvm({
        destinationAddress,
        fromAddress: account.address,
        fromNetwork: Networks.Polygon,
        inputTokenDetails: {
          erc20AddressSourceChain: ERC20_EURE_POLYGON
        } as unknown as EvmTokenDetails, // Always EUR.e for Monerium onramp.
        outputTokenDetails, // By design, EURC onramp starts from Polygon.
        rawAmount: inputAmountPostAnchorFeeRaw,
        toNetwork
      });

      unsignedTxs.push({
        meta: {},
        network: MONERIUM_MINT_NETWORK,
        nonce: polygonAccountNonce++,
        phase: "squidRouterApprove",
        signer: account.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      });

      unsignedTxs.push({
        meta: {},
        network: MONERIUM_MINT_NETWORK,
        nonce: polygonAccountNonce++,
        phase: "squidRouterSwap",
        signer: account.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      });

      stateMeta = {
        ...stateMeta,
        squidRouterQuoteId
      };
    }
  }

  return { stateMeta, unsignedTxs };
}

async function createOnrampUserApprove(amountRaw: string, toAddress: string): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(MONERIUM_MINT_NETWORK);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [toAddress, amountRaw],
    functionName: "approve"
  });

  const { maxFeePerGas } = await polygonClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURE_POLYGON,
    value: "0"
  };

  return txData;
}

async function createOnrampEphemeralSelfTransfer(
  amountRaw: string,
  fromAddress: string,
  toAddress: string
): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(MONERIUM_MINT_NETWORK);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [fromAddress, toAddress, amountRaw],
    functionName: "transferFrom"
  });

  const { maxFeePerGas } = await polygonClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURE_POLYGON,
    value: "0"
  };

  return txData;
}
