import {
  createOfframpSquidrouterTransactionsToEvm,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  isEvmTokenDetails,
  isWithdrawInstructions,
  MykoboApiService,
  MykoboCurrency,
  MykoboTransactionType,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../..";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { addNablaSwapTransactionsOnBase, addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { validateOfframpQuote } from "../common/validation";

export async function prepareEvmToMykoboOfframpTransactions({
  quote,
  signingAccounts,
  userAddress,
  email,
  destinationAddress,
  ipAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const { fromNetwork, inputTokenDetails } = validateOfframpQuote(quote, signingAccounts, { requireSubstrateEphemeral: false });

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral account not found for EVM to Mykobo offramp");
  }

  if (!email) {
    throw new Error("email must be provided for Mykobo (EUR) offramp");
  }

  if (!ipAddress) {
    throw new Error("ipAddress must be provided for Mykobo (EUR) offramp");
  }

  if (!destinationAddress) {
    throw new Error("destinationAddress (user receiving wallet) must be provided for Mykobo offramp");
  }

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error("EVM to Mykobo route requires EVM input token");
  }

  const baseUsdcAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!baseUsdcAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }

  const baseEurcAddress = evmTokenConfig[Networks.Base][EvmToken.EURC]?.erc20AddressSourceChain;
  if (!baseEurcAddress) {
    throw new Error("Invalid EURC configuration for Base in evmTokenConfig");
  }

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (!(fromNetwork === Networks.Base && inputTokenDetails.erc20AddressSourceChain === baseUsdcAddress)) {
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

  const mykoboIntentValue = quote.metadata.nablaSwapEvm?.outputAmountDecimal;
  if (!mykoboIntentValue) {
    throw new Error("Missing nablaSwapEvm.outputAmountDecimal in quote metadata for Mykobo intent value");
  }

  const mykobo = MykoboApiService.getInstance();
  const intent = await mykobo.createTransactionIntent({
    currency: MykoboCurrency.EURC,
    email_address: email,
    ip_address: ipAddress,
    transaction_type: MykoboTransactionType.WITHDRAW,
    value: new Big(mykoboIntentValue).toFixed(6, 0),
    wallet_address: evmEphemeralEntry.address
  });

  if (!isWithdrawInstructions(intent.instructions)) {
    throw new Error("Mykobo intent did not return withdraw instructions; cannot derive receivables address");
  }
  const mykoboReceivablesAddress = intent.instructions.address;
  const mykoboTransactionId = intent.transaction.id;
  const mykoboTransactionReference = intent.transaction.reference;

  let baseNonce = 0;
  baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, baseNonce);

  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactionsOnBase(
    {
      account: evmEphemeralEntry,
      inputTokenAddress: baseUsdcAddress,
      outputTokenAddress: baseEurcAddress,
      quote
    },
    unsignedTxs,
    baseNonce
  );
  stateMeta = { ...stateMeta, ...nablaStateMeta };
  baseNonce = nonceAfterNabla;

  const eurcTransferAmountRaw = quote.metadata.nablaSwapEvm?.outputAmountRaw;
  if (!eurcTransferAmountRaw) {
    throw new Error("Missing outputAmountRaw in nablaSwapEvm metadata");
  }

  const payoutTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: eurcTransferAmountRaw,
    destinationNetwork: Networks.Base,
    isNativeToken: false,
    toAddress: mykoboReceivablesAddress as `0x${string}`,
    toToken: baseEurcAddress as `0x${string}`
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce,
    phase: "mykoboPayoutOnBase",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(payoutTransfer) as EvmTransactionData
  });
  baseNonce++;

  const baseFundingAccount = getEvmFundingAccount(Networks.Base);

  const usdcCleanupApproval = await prepareBaseCleanupApproval(
    baseUsdcAddress as `0x${string}`,
    baseFundingAccount.address,
    Networks.Base
  );
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupUsdc",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(usdcCleanupApproval) as EvmTransactionData
  });

  const eurcCleanupApproval = await prepareBaseCleanupApproval(
    baseEurcAddress as `0x${string}`,
    baseFundingAccount.address,
    Networks.Base
  );
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupEurc",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(eurcCleanupApproval) as EvmTransactionData
  });

  const baseAxlUsdcAddress = evmTokenConfig[Networks.Base][EvmToken.AXLUSDC]?.erc20AddressSourceChain;
  if (!baseAxlUsdcAddress) {
    throw new Error("Invalid AXLUSDC configuration for Base in evmTokenConfig");
  }
  const axlUsdcCleanupApproval = await prepareBaseCleanupApproval(
    baseAxlUsdcAddress as `0x${string}`,
    baseFundingAccount.address,
    Networks.Base
  );
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupAxlUsdc",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(axlUsdcCleanupApproval) as EvmTransactionData
  });

  stateMeta = {
    ...stateMeta,
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    mykoboEmail: email,
    mykoboReceivablesAddress,
    mykoboTransactionId,
    mykoboTransactionReference,
    walletAddress: userAddress
  };

  return { stateMeta, unsignedTxs };
}
