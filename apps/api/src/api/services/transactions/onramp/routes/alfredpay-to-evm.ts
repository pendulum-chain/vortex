import {
  ALFREDPAY_ERC20_TOKEN,
  AlfredPayCountry,
  AlfredPayStatus,
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isEvmToken,
  isOnChainToken,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../../constants/constants";
import AlfredPayCustomer from "../../../../../models/alfredPayCustomer.model";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { addDestinationChainApprovalTransaction, addOnrampDestinationChainTransactions } from "../common/transactions";
import { AlfredpayOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";

/**
 * Prepares all transactions for Alfredpay (USD) onramp to EVM chain.
 * This route handles: USD → Polygon (USDC/USDT) → EVM (final transfer)
 */
export async function prepareAlfredpayToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  userId
}: AlfredpayOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate that destinationAddress is a valid EVM address for EVM routes
  if (!isAddress(destinationAddress)) {
    throw new Error(`Invalid destination address for EVM route: ${destinationAddress}. Must be a valid EVM address.`);
  }

  const evmEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral entry not found");
  }

  if (quote.metadata.alfredpayMint?.outputAmountRaw === undefined) {
    throw new Error("Missing alfredpay raw mint amount in quote metadata");
  }

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork || toNetwork === Networks.AssetHub) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }

  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!outputTokenDetails || !isEvmToken(quote.outputCurrency)) {
    throw new Error(`Output token details not found for ${quote.outputCurrency} on network ${toNetwork}`);
  }

  const fiatToCountry: Partial<Record<FiatToken, AlfredPayCountry>> = {
    [FiatToken.USD]: AlfredPayCountry.US,
    [FiatToken.MXN]: AlfredPayCountry.MX,
    [FiatToken.COP]: AlfredPayCountry.CO
  };
  const customerCountry = fiatToCountry[quote.inputCurrency as FiatToken];
  if (!customerCountry) {
    throw new Error(`Unsupported Alfredpay input currency: ${quote.inputCurrency}`);
  }

  const customer = await AlfredPayCustomer.findOne({
    where: { country: customerCountry, userId }
  });

  if (!customer) {
    throw new Error(`Alfredpay customer not found for userId ${userId}`);
  }

  if (customer.status !== AlfredPayStatus.Success) {
    throw new Error(`Alfredpay customer status is ${customer.status}, expected Success. Proceed first with KYC.`);
  }

  // Setup state metadata
  stateMeta = {
    alfredpayUserId: customer.alfredPayId,
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address
  };

  let polygonAccountNonce = 0; // Starts fresh

  // Special case: onramping the AlfredPay token directly on Polygon. Skip SquidRouter and transfer directly.
  if ((outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain === ALFREDPAY_ERC20_TOKEN) {
    const finalTransferTxData = await addOnrampDestinationChainTransactions({
      amountRaw: quote.metadata.alfredpayMint.outputAmountRaw,
      destinationNetwork: toNetwork as EvmNetworks,
      toAddress: destinationAddress,
      toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
    });
    unsignedTxs.push({
      meta: {},
      network: toNetwork,
      nonce: polygonAccountNonce,
      phase: "destinationTransfer",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(finalTransferTxData) as EvmTransactionData
    });

    stateMeta = {
      ...stateMeta
    };

    return { stateMeta, unsignedTxs };
  }

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromPolygonToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: ALFREDPAY_ERC20_TOKEN,
      rawAmount: quote.metadata.alfredpayMint.outputAmountRaw,
      toNetwork,
      toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
    });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon, // Hardcoded to mint on Polygon
    nonce: polygonAccountNonce++,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: polygonAccountNonce++,
    phase: "squidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  const finalTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayMint.outputAmountRaw,
    destinationNetwork: toNetwork as EvmNetworks,
    toAddress: destinationAddress,
    toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
  });

  let destinationNonce = toNetwork === Networks.Polygon ? polygonAccountNonce++ : 0; // If the destination is Polygon, we need to use the same nonce sequence. Otherwise, we start fresh on the new chain.

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce++,
    phase: "destinationTransfer",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalTransferTxData) as EvmTransactionData
  });

  // Fallback swap depends on the EVM chain. For Ethereum, the bridged token is USDC. For the rest, it is axlUSDC.
  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toNetwork as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;
  const bridgedTokenForFallback =
    toNetwork === Networks.Ethereum
      ? evmTokenConfig.ethereum.USDC!.erc20AddressSourceChain
      : destinationAxlUsdcDetails.erc20AddressSourceChain;

  const { approveData: destApproveData, swapData: destSwapData } = await createOnrampSquidrouterTransactionsOnDestinationChain({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: evmEphemeralEntry.address,
    fromToken: bridgedTokenForFallback,
    network: toNetwork as EvmNetworks,
    rawAmount: quote.metadata.alfredpayMint.outputAmountRaw,
    toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
  });

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

  // We set this to 0 on purpose because we don't want to risk that the required nonce is never reached
  const backupApproveNonce = 0;
  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: backupApproveNonce,
    phase: "backupApprove",
    signer: evmEphemeralEntry.address,
    txData: backupApproveTransaction
  });

  const alfredMintFallbackTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayMint.outputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: destinationAddress,
    toToken: ALFREDPAY_ERC20_TOKEN
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: polygonAccountNonce++,
    phase: "alfredOnrampMintFallback",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(alfredMintFallbackTransferTxData) as EvmTransactionData
  });

  stateMeta = {
    ...stateMeta,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
