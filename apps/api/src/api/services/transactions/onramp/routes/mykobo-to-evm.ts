import {
  createOnrampSquidrouterTransactionsFromBaseToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  ERC20_EURC_BASE,
  EvmNetworks,
  EvmToken,
  EvmTransactionData,
  FiatToken,
  getOnChainTokenDetails,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../../constants/constants";
import { MYKOBO_BASE_NETWORK } from "../../../mykobo";
import { StateMetadata } from "../../../phases/meta-state-types";
import { priceFeedService } from "../../../priceFeed.service";
import { encodeEvmTransactionData } from "../../index";
import { createMykoboPullToEphemeralOnBase } from "../common/mykobo";
import { addDestinationChainApprovalTransaction, addOnrampDestinationChainTransactions } from "../common/transactions";
import { MykoboOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMykoboOnramp } from "../common/validation";

type PushTx = (network: Networks, phase: RampPhase, txData: UnsignedTx["txData"]) => void;

// Appends the on-destination-chain backup route: if the cross-chain swap to the user's chosen
// output token fails, the funding account can finish the conversion from the bridged
// intermediary (USDC on Ethereum, AXLUSDC elsewhere) into the output token directly on
// the destination chain.
async function appendBackupRouteTransactions(args: {
  pushTx: PushTx;
  toNetwork: EvmNetworks;
  ephemeralAddress: string;
  outputTokenAddress: `0x${string}`;
  inputCurrency: FiatToken;
  inputAmountDecimal: Big;
}): Promise<void> {
  const { pushTx, toNetwork, ephemeralAddress, outputTokenAddress, inputCurrency, inputAmountDecimal } = args;

  const symbol = toNetwork === Networks.Ethereum ? EvmToken.USDC : EvmToken.AXLUSDC;
  const bridgedToken = getOnChainTokenDetails(toNetwork, symbol);
  if (!bridgedToken || !isEvmTokenDetails(bridgedToken)) {
    throw new Error(`${symbol} token details not configured (as EVM token) for network ${toNetwork}`);
  }

  const intermediateUsd = await priceFeedService.convertCurrency(
    inputAmountDecimal.toFixed(2, 0),
    inputCurrency,
    EvmToken.USDC
  );
  const intermediateUsdRaw = multiplyByPowerOfTen(intermediateUsd, bridgedToken.decimals).toFixed(0, 0);

  const { approveData, swapData } = await createOnrampSquidrouterTransactionsOnDestinationChain({
    destinationAddress: ephemeralAddress,
    fromAddress: ephemeralAddress,
    fromToken: bridgedToken.erc20AddressSourceChain,
    network: toNetwork,
    rawAmount: intermediateUsdRaw,
    toToken: outputTokenAddress
  });
  pushTx(toNetwork, "backupSquidRouterApprove", encodeEvmTransactionData(approveData) as EvmTransactionData);
  pushTx(toNetwork, "backupSquidRouterSwap", encodeEvmTransactionData(swapData) as EvmTransactionData);

  const maxUint256 = 2n ** 256n - 1n;
  const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: maxUint256.toString(),
    destinationNetwork: toNetwork,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedToken.erc20AddressSourceChain
  });
  pushTx(toNetwork, "backupApprove", backupApproveTransaction);
}

/**
 * Prepares all transactions for a Mykobo (EUR) onramp to EVM chain.
 * EURC is minted natively on Base by Mykobo; the ephemeral pulls it via permit+transferFrom,
 * then Squidrouter bridges/swaps to the destination chain and token.
 */
export async function prepareMykoboToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  mykoboWalletAddress
}: MykoboOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];

  if (!isAddress(destinationAddress)) {
    throw new Error(`Invalid destination address for EVM route: ${destinationAddress}. Must be a valid EVM address.`);
  }

  const { toNetwork, outputTokenDetails, evmEphemeralEntry, inputCurrency } = validateMykoboOnramp(quote, signingAccounts);

  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for Mykobo onramp.`);
  }

  if (!quote.metadata.mykoboMint?.outputAmountRaw) {
    throw new Error("Missing mykoboMint output amount in quote metadata");
  }

  if (!quote.metadata.evmToEvm?.inputAmountDecimal) {
    throw new Error("Missing evmToEvm input amount in quote metadata");
  }

  const inputAmountPostAnchorFeeRaw = new Big(quote.metadata.mykoboMint.outputAmountRaw).toFixed(0, 0);

  // Per-network nonce allocator. When toNetwork === MYKOBO_BASE_NETWORK (same-chain Base
  // destination), both keys collapse to the same counter automatically — no special-case
  // arithmetic needed.
  const nonces = new Map<Networks, number>();
  const pushTx: PushTx = (network, phase, txData) => {
    const nonce = nonces.get(network) ?? 0;
    nonces.set(network, nonce + 1);
    unsignedTxs.push({ meta: {}, network, nonce, phase, signer: evmEphemeralEntry.address, txData });
  };

  const basePullTxData = await createMykoboPullToEphemeralOnBase(
    inputAmountPostAnchorFeeRaw,
    mykoboWalletAddress,
    evmEphemeralEntry.address
  );
  pushTx(MYKOBO_BASE_NETWORK, "mykoboOnrampTransfer", encodeEvmTransactionData(basePullTxData) as EvmTransactionData);

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromBaseToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: ERC20_EURC_BASE,
      rawAmount: inputAmountPostAnchorFeeRaw,
      toNetwork,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });
  pushTx(MYKOBO_BASE_NETWORK, "squidRouterApprove", encodeEvmTransactionData(approveData) as EvmTransactionData);
  pushTx(MYKOBO_BASE_NETWORK, "squidRouterSwap", encodeEvmTransactionData(swapData) as EvmTransactionData);

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals);
  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw.toString(),
    destinationNetwork: toNetwork,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });
  pushTx(toNetwork, "destinationTransfer", finalDestinationTransfer);

  await appendBackupRouteTransactions({
    ephemeralAddress: evmEphemeralEntry.address,
    inputAmountDecimal: quote.metadata.evmToEvm.inputAmountDecimal,
    inputCurrency,
    outputTokenAddress: outputTokenDetails.erc20AddressSourceChain,
    pushTx,
    toNetwork
  });

  const stateMeta: Partial<StateMetadata> = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    mykoboWalletAddress,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId,
    walletAddress: destinationAddress
  };

  return { stateMeta, unsignedTxs };
}
