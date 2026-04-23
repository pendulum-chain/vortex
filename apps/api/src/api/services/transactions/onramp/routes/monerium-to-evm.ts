import {
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  ERC20_EURE_POLYGON_V1,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  getOnChainTokenDetailsOrDefault,
  isAssetHubTokenDetails,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY, SANDBOX_ENABLED } from "../../../../../constants/constants";
import { StateMetadata } from "../../../phases/meta-state-types";
import { priceFeedService } from "../../../priceFeed.service";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer } from "../common/monerium";
import { addDestinationChainApprovalTransaction, addOnrampDestinationChainTransactions } from "../common/transactions";
import { MoneriumOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";

/**
 * Prepares all transactions for a Monerium (EUR) onramp to EVM chain.
 * This route handles: EUR → Polygon (EURE) → EVM (final transfer)
 */
export async function prepareMoneriumToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  moneriumWalletAddress
}: MoneriumOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, evmEphemeralEntry } = validateMoneriumOnramp(quote, signingAccounts);

  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for onramp.`);
  }

  if (!quote.metadata.moneriumMint?.outputAmountRaw) {
    throw new Error("Missing moonbeamToEvm output amount in quote metadata");
  }

  if (!quote.metadata.evmToEvm?.inputAmountDecimal) {
    throw new Error("Missing evmToEvm input amount in quote metadata");
  }

  const inputAmountPostAnchorFeeRaw = new Big(quote.metadata.moneriumMint.outputAmountRaw).toFixed(0, 0);

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    moneriumWalletAddress,
    walletAddress: destinationAddress
  };

  const moneriumMintNetwork = SANDBOX_ENABLED ? Networks.PolygonAmoy : Networks.Polygon;

  let polygonAccountNonce = 0;

  const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
    inputAmountPostAnchorFeeRaw,
    moneriumWalletAddress,
    evmEphemeralEntry.address
  );

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "moneriumOnrampSelfTransfer",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
  });

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromPolygonToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: ERC20_EURE_POLYGON_V1,
      rawAmount: inputAmountPostAnchorFeeRaw,
      toNetwork,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "squidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  let destinationNonce = toNetwork === Networks.Polygon ? polygonAccountNonce : 0;

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals);
  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "destinationTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalDestinationTransfer
  });

  // Fallback swap depends on the EVM chain. For Ethereum, the bridged token is USDC. For the rest, it is axlUSDC.
  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toNetwork as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;

  const bridgedTokenForFallback =
    toNetwork === Networks.Ethereum
      ? evmTokenConfig.ethereum.USDC!.erc20AddressSourceChain
      : destinationAxlUsdcDetails.erc20AddressSourceChain;

  const intermediateUsdAmountForFallback = await priceFeedService.convertCurrency(
    Big(quote.metadata.evmToEvm?.inputAmountDecimal).toFixed(2, 0),
    quote.inputCurrency,
    EvmToken.USDC
  );
  const intermediateUsdAmountForFallbackRaw = multiplyByPowerOfTen(
    intermediateUsdAmountForFallback,
    destinationAxlUsdcDetails.decimals
  ).toFixed(0, 0);

  const { approveData: destApproveData, swapData: destSwapData } = await createOnrampSquidrouterTransactionsOnDestinationChain({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: evmEphemeralEntry.address,
    fromToken: bridgedTokenForFallback,
    network: toNetwork as EvmNetworks,
    rawAmount: intermediateUsdAmountForFallbackRaw,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(destApproveData) as EvmTransactionData
  });
  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(destSwapData) as EvmTransactionData
  });
  destinationNonce++;

  const maxUint256 = 2n ** 256n - 1n;
  const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);

  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: maxUint256.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedTokenForFallback
  });

  // We set this to 0 for non-polygon networks on purpose because we don't want to risk that the required nonce
  // is never reached
  const backupApproveNonce = toNetwork === Networks.Polygon ? polygonAccountNonce : 0;
  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: backupApproveNonce,
    phase: "backupApprove",
    signer: evmEphemeralEntry.address,
    txData: backupApproveTransaction
  });

  stateMeta = {
    ...stateMeta,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
