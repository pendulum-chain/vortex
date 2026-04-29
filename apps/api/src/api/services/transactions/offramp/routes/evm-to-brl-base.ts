import {
  createOfframpSquidrouterTransactionsToEvm,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  isEvmTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../..";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { addNablaSwapTransactionsOnBase, addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { validateBRLOfframp, validateOfframpQuote } from "../common/validation";

/**
 * Prepares all transactions for an EVM to BRL offramp.
 * This route handles: EVM → Base (swap) → Avenia Offramp.
 */
export async function prepareEvmToBRLOfframpBaseTransactions({
  quote,
  signingAccounts,
  userAddress,
  pixDestination,
  taxId,
  receiverTaxId,
  brlaEvmAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  // Validate inputs and extract required data
  const { fromNetwork, inputTokenDetails } = validateOfframpQuote(quote, signingAccounts);

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM account not found. An EVM ephemeral account is required for EVM to BRL offramp.");
  }

  const {
    brlaEvmAddress: validatedBrlaEvmAddress,
    pixDestination: validatedPixDestination,
    taxId: validatedTaxId,
    receiverTaxId: validatedReceiverTaxId
  } = validateBRLOfframp(quote, { brlaEvmAddress, pixDestination, receiverTaxId, taxId });

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error("EVM to BRL route requires EVM input token");
  }

  const baseUsdcAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!baseUsdcAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }

  const baseBrlaAddress = evmTokenConfig[Networks.Base][EvmToken.BRLA]?.erc20AddressSourceChain;
  if (!baseBrlaAddress) {
    throw new Error("Invalid BRLA configuration for Base in evmTokenConfig");
  }

  // Special case: if user is already on Base with USDC, skip squidrouter transactions
  if (!(fromNetwork === Networks.Base && inputTokenDetails.erc20AddressSourceChain === baseUsdcAddress)) {
    // TODO Maybe, move to contract-base squid swap.
    // Otherwise use the same approach as previously
    const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: userAddress,
      fromNetwork,
      fromToken: inputTokenDetails.erc20AddressSourceChain,
      rawAmount: inputAmountRaw,
      toNetwork: Networks.Base,
      toToken: baseUsdcAddress
    });

    unsignedTxs.push({
      meta: {},
      network: fromNetwork,
      nonce: 0,
      phase: "squidRouterApprove",
      signer: userAddress,
      txData: encodeEvmTransactionData(approveData) as EvmTransactionData
    });

    unsignedTxs.push({
      meta: {},
      network: fromNetwork,
      nonce: 1,
      phase: "squidRouterSwap",
      signer: userAddress,
      txData: encodeEvmTransactionData(swapData) as EvmTransactionData
    });
  }

  // TODO isn't this missing the rest of the edge case handling?

  let baseNonce = 0;

  const baseUSDCTokenAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!baseUSDCTokenAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }
  const baseBRLATokenAddress = evmTokenConfig[Networks.Base][EvmToken.BRLA]?.erc20AddressSourceChain;
  if (!baseBRLATokenAddress) {
    throw new Error("Invalid BRLA configuration for Base in evmTokenConfig");
  }

  // Add Base Nabla swap transactions (USDC to BRLA on Base)
  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactionsOnBase(
    {
      account: evmEphemeralEntry,
      inputTokenAddress: baseUSDCTokenAddress,
      outputTokenAddress: baseBRLATokenAddress,
      quote
    },
    unsignedTxs,
    baseNonce
  );
  stateMeta = { ...stateMeta, ...nablaStateMeta };
  baseNonce = nonceAfterNabla;

  // Fee distribution transaction on EVM
  baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, baseNonce);

  // Output after swap + discount and subsidy
  const brlaTransferAmountRaw = quote.metadata.nablaSwapEvm?.outputAmountRaw;
  if (!brlaTransferAmountRaw) {
    throw new Error("Missing outputAmountRaw in nablaSwapEvm metadata");
  }

  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: brlaTransferAmountRaw,
    destinationNetwork: Networks.Base,
    isNativeToken: false,
    toAddress: validatedBrlaEvmAddress,
    toToken: baseBrlaAddress as `0x${string}`
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce,
    phase: "brlaPayoutOnBase",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalDestinationTransfer) as EvmTransactionData
  });
  baseNonce++;

  stateMeta = {
    ...stateMeta,
    brlaEvmAddress: validatedBrlaEvmAddress,
    pixDestination: validatedPixDestination,
    receiverTaxId: validatedReceiverTaxId,
    taxId: validatedTaxId
  };

  return { stateMeta, unsignedTxs };
}
