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
import httpStatus from "http-status";
import { encodeFunctionData } from "viem";
import erc20ABI from "../../../../../contracts/ERC20";
import { APIError } from "../../../../errors/api-error";
import { resolveMykoboCustomerForUser } from "../../../mykobo/mykobo-customer.service";
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
  ipAddress,
  userId
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const { fromNetwork, inputTokenDetails } = validateOfframpQuote(quote, signingAccounts, { requireSubstrateEphemeral: false });

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral account not found for EVM to Mykobo offramp");
  }

  // The Mykobo email is derived from the effective user's profile (and KYC must be approved);
  // a client-supplied email is accepted only if it matches. See resolveMykoboCustomerForUser.
  const { email: mykoboEmail } = await resolveMykoboCustomerForUser(userId, email);

  if (!ipAddress) {
    throw new APIError({
      isPublic: true,
      message: "ipAddress must be provided for Mykobo (EUR) offramp",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!destinationAddress) {
    throw new APIError({
      isPublic: true,
      message: "destinationAddress (user receiving wallet) must be provided for Mykobo offramp",
      status: httpStatus.BAD_REQUEST
    });
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

  const baseAxlUsdcAddress = evmTokenConfig[Networks.Base][EvmToken.AXLUSDC]?.erc20AddressSourceChain;
  if (!baseAxlUsdcAddress) {
    throw new Error("Invalid AXLUSDC configuration for Base in evmTokenConfig");
  }

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);
  const inputTokenAddress = inputTokenDetails.erc20AddressSourceChain;
  const isDirectBaseTransfer =
    fromNetwork === Networks.Base && inputTokenAddress.toLowerCase() === baseUsdcAddress.toLowerCase();

  // Resolve the Mykobo intent before building any user-signed transactions so that an API failure aborts early.
  const mykoboIntentValue = quote.metadata.nablaSwapEvm?.outputAmountDecimal;
  if (!mykoboIntentValue) {
    throw new Error("Missing nablaSwapEvm.outputAmountDecimal in quote metadata for Mykobo intent value");
  }

  // Mykobo silently truncates the intent value to 2 decimals. We floor here so the on-chain
  // EURC transfer below matches the amount Mykobo actually credits to the withdraw intent.
  const mykoboFlooredValue = new Big(mykoboIntentValue).toFixed(2, 0);
  const eurcDecimals = evmTokenConfig[Networks.Base][EvmToken.EURC]?.decimals;
  if (eurcDecimals === undefined) {
    throw new Error("Invalid EURC decimals configuration for Base in evmTokenConfig");
  }
  const eurcTransferAmountRaw = multiplyByPowerOfTen(new Big(mykoboFlooredValue), eurcDecimals).toFixed(0, 0);

  const mykobo = MykoboApiService.getInstance();
  const intent = await mykobo.createTransactionIntent({
    currency: MykoboCurrency.EURC,
    email_address: mykoboEmail,
    ip_address: ipAddress,
    transaction_type: MykoboTransactionType.WITHDRAW,
    value: mykoboFlooredValue,
    wallet_address: evmEphemeralEntry.address
  });

  if (!isWithdrawInstructions(intent.instructions)) {
    throw new Error("Mykobo intent did not return withdraw instructions; cannot derive receivables address");
  }
  const mykoboReceivablesAddress = intent.instructions.address;
  const mykoboTransactionId = intent.transaction.id;
  const mykoboTransactionReference = intent.transaction.reference;

  if (isDirectBaseTransfer) {
    // User already holds USDC on Base — they sign a single ERC-20 transfer to the ephemeral.
    // Mirrors the isDirectPolygonTransfer branch in evm-to-alfredpay.ts.
    const transferData = encodeFunctionData({
      abi: erc20ABI,
      args: [evmEphemeralEntry.address as `0x${string}`, BigInt(inputAmountRaw)],
      functionName: "transfer"
    });

    unsignedTxs.push({
      meta: {},
      network: fromNetwork,
      nonce: 0,
      phase: "squidRouterNoPermitTransfer",
      signer: userAddress,
      txData: {
        data: transferData,
        gas: "0",
        to: inputTokenAddress,
        value: "0"
      }
    });
  } else {
    const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: userAddress,
      fromNetwork,
      fromToken: inputTokenAddress,
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

  let baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, 0);

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
  stateMeta = nablaStateMeta;
  baseNonce = nonceAfterNabla;

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

  const cleanupTokens = [
    { address: baseUsdcAddress, phase: "baseCleanupUsdc" as const },
    { address: baseEurcAddress, phase: "baseCleanupEurc" as const },
    { address: baseAxlUsdcAddress, phase: "baseCleanupAxlUsdc" as const }
  ];

  for (const { address, phase } of cleanupTokens) {
    const approval = await prepareBaseCleanupApproval(address as `0x${string}`, baseFundingAccount.address, Networks.Base);
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase,
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(approval) as EvmTransactionData
    });
  }

  stateMeta = {
    ...stateMeta,
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    mykoboEmail,
    mykoboReceivablesAddress,
    mykoboTransactionId,
    mykoboTransactionReference,
    walletAddress: userAddress
  };

  return { stateMeta, unsignedTxs };
}
