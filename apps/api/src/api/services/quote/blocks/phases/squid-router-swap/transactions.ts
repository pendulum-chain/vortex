import {
  createOnrampSquidrouterTransactionsFromBaseToEvm,
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  getOnChainTokenDetails,
  getOnChainTokenDetailsOrDefault,
  Networks,
  OnChainToken
} from "@vortexfi/shared";
import Big from "big.js";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { addDestinationChainApprovalTransaction } from "../../../../transactions/onramp/common/transactions";
import type { ChainBrand, PrepareCtx, PreparedPhaseTxs, TokenBrand } from "../../core/types";
import type { SquidRouterSwapMetadata } from "./simulation";

export interface SquidRouterSwapPreparation {
  quoteId: string;
  receiverHash?: string;
  receiverId?: string;
}

// Bound the backup approval to the bridged amount + 5% slippage cushion (replaces unbounded maxUint256).
const BACKUP_APPROVE_SLIPPAGE_FACTOR = "1.05";

// The presigned bridge approve+swap the SquidRouterSwapExecutor broadcasts, plus the bridge's
// contingency lane on the destination chain: a re-swap of the bridged fallback token to the target
// token and an approval letting the funding account recover it. Reads only this phase's own
// simulated metadata.
export async function prepareSquidRouterSwapTxs(
  fromChain: ChainBrand,
  toChain: ChainBrand,
  fromToken: TokenBrand,
  toToken: TokenBrand,
  ctx: PrepareCtx<SquidRouterSwapMetadata>
): Promise<PreparedPhaseTxs> {
  const { evmEphemeral, ownMetadata } = ctx;

  const bridgeInputAmountRaw = ownMetadata.inputAmountRaw;

  const fromTokenDetails = evmTokenConfig[fromChain as EvmNetworks]?.[fromToken as EvmToken];
  if (!fromTokenDetails) {
    throw new Error(`prepareSquidRouterSwapTxs: Missing token config for ${fromToken} on ${fromChain}`);
  }

  const toTokenDetails = getOnChainTokenDetails(toChain as Networks, toToken as OnChainToken) as EvmTokenDetails | undefined;
  if (!toTokenDetails) {
    throw new Error(`prepareSquidRouterSwapTxs: Missing token details for ${toToken} on ${toChain}`);
  }

  const createSourceTransactions =
    fromChain === Networks.Polygon
      ? createOnrampSquidrouterTransactionsFromPolygonToEvm
      : createOnrampSquidrouterTransactionsFromBaseToEvm;
  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createSourceTransactions({
      destinationAddress: evmEphemeral.address,
      fromAddress: evmEphemeral.address,
      fromToken: fromTokenDetails.erc20AddressSourceChain,
      rawAmount: bridgeInputAmountRaw,
      toNetwork: toChain as Networks,
      toToken: toTokenDetails.erc20AddressSourceChain
    });
  if (!squidRouterQuoteId) {
    throw new Error("prepareSquidRouterSwapTxs: Squid quote ID is missing");
  }

  // Fallback re-swap input depends on the destination chain: the bridge delivers USDC on Ethereum
  // and axlUSDC everywhere else.
  let bridgedTokenForFallback: `0x${string}`;
  if (toChain === Networks.Ethereum) {
    const ethereumUsdc = evmTokenConfig.ethereum.USDC;
    if (!ethereumUsdc) {
      throw new Error("prepareSquidRouterSwapTxs: USDC config missing for Ethereum");
    }
    bridgedTokenForFallback = ethereumUsdc.erc20AddressSourceChain as `0x${string}`;
  } else {
    const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toChain as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;
    bridgedTokenForFallback = destinationAxlUsdcDetails.erc20AddressSourceChain as `0x${string}`;
  }

  const { approveData: backupApproveData, swapData: backupSwapData } =
    await createOnrampSquidrouterTransactionsOnDestinationChain({
      destinationAddress: evmEphemeral.address,
      fromAddress: evmEphemeral.address,
      fromToken: bridgedTokenForFallback,
      network: toChain as EvmNetworks,
      rawAmount: bridgeInputAmountRaw,
      toToken: toTokenDetails.erc20AddressSourceChain
    });

  const fundingAccountAddress = getEvmFundingAccount(fromChain as EvmNetworks).address;
  const backupApproveAmountRaw =
    fromChain === Networks.Polygon
      ? (2n ** 256n - 1n).toString()
      : new Big(bridgeInputAmountRaw).mul(BACKUP_APPROVE_SLIPPAGE_FACTOR).toFixed(0, 0);
  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: backupApproveAmountRaw,
    destinationNetwork: toChain as EvmNetworks,
    spenderAddress: fundingAccountAddress,
    tokenAddress: bridgedTokenForFallback
  });

  return {
    intents: [
      {
        lane: "main",
        network: fromChain as Networks,
        phase: "squidRouterApprove",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      },
      {
        lane: "main",
        network: fromChain as Networks,
        phase: "squidRouterSwap",
        prefundNativeValueRaw: swapData.value?.toString() ?? "0",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      },
      {
        lane: "backup",
        network: toChain as Networks,
        phase: "backupSquidRouterApprove",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(backupApproveData) as EvmTransactionData
      },
      {
        lane: "backup",
        network: toChain as Networks,
        phase: "backupSquidRouterSwap",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(backupSwapData) as EvmTransactionData
      },
      {
        // Pinned to the first main nonce on the destination chain so the approval can always
        // broadcast even if the txs between never do.
        lane: "backup",
        network: toChain as Networks,
        phase: "backupApprove",
        reuseFirstMainNonce: true,
        signer: evmEphemeral.address,
        txData: backupApproveTransaction
      }
    ],
    state: {
      quoteId: squidRouterQuoteId,
      receiverHash: squidRouterReceiverHash,
      receiverId: squidRouterReceiverId
    }
  };
}

export async function prepareSameChainSquidRouterSwapTxs(
  fromChain: ChainBrand,
  toChain: ChainBrand,
  fromToken: TokenBrand,
  toToken: TokenBrand,
  ctx: PrepareCtx<SquidRouterSwapMetadata>
): Promise<PreparedPhaseTxs> {
  const fromTokenDetails = evmTokenConfig[fromChain as EvmNetworks]?.[fromToken as EvmToken];
  const toTokenDetails = getOnChainTokenDetails(toChain as Networks, toToken as OnChainToken) as EvmTokenDetails | undefined;
  if (!fromTokenDetails || !toTokenDetails) {
    throw new Error(`prepareSameChainSquidRouterSwapTxs: Missing token details for ${fromToken}/${toToken} on ${fromChain}`);
  }

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromPolygonToEvm({
      destinationAddress: ctx.evmEphemeral.address,
      fromAddress: ctx.evmEphemeral.address,
      fromToken: fromTokenDetails.erc20AddressSourceChain,
      rawAmount: ctx.ownMetadata.inputAmountRaw,
      toNetwork: toChain as Networks,
      toToken: toTokenDetails.erc20AddressSourceChain
    });
  if (!squidRouterQuoteId) {
    throw new Error("prepareSameChainSquidRouterSwapTxs: Squid quote ID is missing");
  }

  return {
    intents: [
      {
        lane: "main",
        network: fromChain as Networks,
        phase: "squidRouterApprove",
        signer: ctx.evmEphemeral.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      },
      {
        lane: "main",
        network: fromChain as Networks,
        phase: "squidRouterSwap",
        prefundNativeValueRaw: swapData.value?.toString() ?? "0",
        signer: ctx.evmEphemeral.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      }
    ],
    state: {
      quoteId: squidRouterQuoteId,
      receiverHash: squidRouterReceiverHash,
      receiverId: squidRouterReceiverId
    }
  };
}
