import {
  createOfframpSquidrouterTransactionsToEvm,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  getNetworkId,
  isWithdrawInstructions,
  MykoboApiService,
  MykoboCurrency,
  MykoboTransactionType,
  multiplyByPowerOfTen,
  Networks,
  SignedTypedData,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { encodeFunctionData } from "viem";
import { APIError } from "../../../../errors/api-error";
import { syncMykoboCustomerKyc } from "../../../mykobo/mykobo-customer.service";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { StateMetadata } from "../../../phases/meta-state-types";
import { EUR_OFFRAMP_BASE_MORPHO, EUR_OFFRAMP_MORPHO } from "../../../phases/ramp-flow-definitions";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import { addNablaSwapTransactionsOnBase, addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";
import { resolvePermitDomain } from "./evm-to-alfredpay";

const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" }
] as const;

const REDEEM_SLIPPAGE_BPS = 50; // 0.5% — covers interest accrual between quote-time and redeem-time (0% vault fee assumed)
const APPROVE_BUFFER_BPS = 100; // 1% — exact output + 1% for interest accrual before bridge

const vaultRedeemAbi = [
  {
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" }
    ],
    name: "redeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

/**
 * Prepares all transactions for an offramp from Morpho vault shares on any EVM
 * chain → SEPA payout via Mykobo on Base.
 *
 * Flow:
 *   1. User signs a single EIP-2612 Permit typed data on the vault (spender = ephemeral).
 *      This is submitted as a presignedTx (SignedTypedData) at registration.
 *   2. morphoPermitExecute handler broadcasts:
 *      a) vault.permit(owner, spender, value, deadline, v, r, s) using the executor key —
 *         permit() does not require the spender to be the caller, so this is fine.
 *      b) vault.transferFrom(user, ephemeral, shares) signed by the ephemeral (presignedTx,
 *         nonce 0 on the vault's chain). Only the spender can call transferFrom on its own
 *         allowance.
 *   3. morphoRedeem: ephemeral calls vault.redeem(shares, ephemeral, ephemeral) → USDC on
 *      the vault's chain.
 *   4. If the vault is NOT on Base, SquidRouter bridge brings the USDC to Base. If the
 *      vault IS on Base, this step is skipped.
 *   5. On Base: distribute fees, swap USDC→EURC via Nabla, transfer EURC to Mykobo, cleanups.
 */
export async function prepareEvmToMykoboMorphoOfframpTransactions({
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

  if (!email) {
    throw new APIError({
      isPublic: true,
      message: "email must be provided for Morpho EUR offramp (Mykobo)",
      status: httpStatus.BAD_REQUEST
    });
  }
  if (!ipAddress) {
    throw new APIError({
      isPublic: true,
      message: "ipAddress must be provided for Morpho EUR offramp (Mykobo)",
      status: httpStatus.BAD_REQUEST
    });
  }
  if (!destinationAddress) {
    throw new APIError({
      isPublic: true,
      message: "destinationAddress (user receiving wallet) must be provided for Morpho EUR offramp",
      status: httpStatus.BAD_REQUEST
    });
  }
  if (!userAddress) {
    throw new Error("User address must be provided for Morpho offramping");
  }

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral account not found for Morpho to Mykobo offramp");
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

  const morphoVault = getMorphoVaultInfo("usdc-base");
  const morphoNetwork = morphoVault.network as EvmNetworks;
  const isBaseVault = morphoNetwork === Networks.Base;

  const evmClientManager = EvmClientManager.getInstance();
  const vaultClient = evmClientManager.getClient(morphoNetwork);
  const vaultChainId = getNetworkId(morphoNetwork);

  if (!vaultChainId) {
    throw new Error(`Could not resolve chain id for ${morphoNetwork}`);
  }

  const userNonce = (await vaultClient.readContract({
    abi: erc20Abi,
    address: morphoVault.vaultAddress,
    args: [userAddress],
    functionName: "nonces"
  })) as bigint;

  const tokenName = (await vaultClient.readContract({
    abi: erc20Abi,
    address: morphoVault.vaultAddress,
    functionName: "name"
  })) as string;

  const resolvedDomain = await resolvePermitDomain(vaultClient, morphoVault.vaultAddress, vaultChainId, tokenName);

  const sharesAmountRaw = quote.metadata.redeemMeta?.sharesAmountRaw;
  if (!sharesAmountRaw) {
    throw new Error("Missing quote.metadata.redeemMeta.sharesAmountRaw; was the offramp Morpho initialize engine run?");
  }

  if (!isBaseVault && !quote.metadata.evmToEvm?.inputAmountRaw) {
    throw new Error("Missing evmToEvm.inputAmountRaw in quote metadata for Morpho offramp (bridge input)");
  }

  const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);

  // 1. User-signed EIP-2612 Permit typed data (spender = ephemeral).
  //    Submitted as a presignedTx (SignedTypedData) at registration. The handler validates the
  //    typed data, then uses the embedded v/r/s to call vault.permit via the executor key.
  const permitTypedData: SignedTypedData = {
    domain: resolvedDomain,
    message: {
      deadline: permitDeadline.toString(),
      nonce: userNonce.toString(),
      owner: userAddress,
      spender: evmEphemeralEntry.address,
      value: sharesAmountRaw
    },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    }
  };

  unsignedTxs.push({
    meta: {},
    network: morphoNetwork,
    nonce: 0,
    phase: "morphoPermitExecute",
    signer: userAddress,
    txData: permitTypedData
  });

  // 2. Ephemeral-signed transferFrom presigned tx. Only the spender (the ephemeral) can call
  //    transferFrom on the allowance granted by permit(), so this must be ephemeral-signed.
  //    Phase + signer match the existing alfredpay direct-transfer pattern; the handler reads
  //    the user-signed permit entry and the ephemeral-signed transferFrom entry together.
  const { maxFeePerGas, maxPriorityFeePerGas } = await vaultClient.estimateFeesPerGas();

  const transferFromCallData = encodeFunctionData({
    abi: [
      {
        inputs: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" }
        ],
        name: "transferFrom",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function"
      }
    ],
    args: [userAddress as `0x${string}`, evmEphemeralEntry.address as `0x${string}`, BigInt(sharesAmountRaw)],
    functionName: "transferFrom"
  });

  unsignedTxs.push({
    meta: {},
    network: morphoNetwork,
    nonce: 0,
    phase: "morphoPermitExecute",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData({
      data: transferFromCallData,
      gas: "200000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: morphoVault.vaultAddress,
      value: "0"
    }) as EvmTransactionData
  });

  // 3. morphoRedeem: ephemeral calls vault.redeem(shares, ephemeral, ephemeral)
  //    → USDC on the vault's chain.
  const redeemCallData = encodeFunctionData({
    abi: vaultRedeemAbi,
    args: [BigInt(sharesAmountRaw), evmEphemeralEntry.address as `0x${string}`, evmEphemeralEntry.address as `0x${string}`],
    functionName: "redeem"
  });

  let morphoRedeemNonce = 1;
  unsignedTxs.push({
    meta: {},
    network: morphoNetwork,
    nonce: morphoRedeemNonce++,
    phase: "morphoRedeem",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData({
      data: redeemCallData,
      gas: "500000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: morphoVault.vaultAddress,
      value: "0"
    }) as EvmTransactionData
  });

  // 4. SquidRouter bridge: only when the vault is on a chain other than Base.
  let squidRouterQuoteId: string | undefined;
  if (!isBaseVault) {
    const bridgeInputAmountRaw = quote.metadata.evmToEvm?.inputAmountRaw;
    if (!bridgeInputAmountRaw) {
      throw new Error("Missing evmToEvm.inputAmountRaw in quote metadata for Morpho offramp (bridge input)");
    }
    // Approve 1% more than expected bridge input to cover interest accrual between redeem and bridge.
    const approveAmountRaw = (BigInt(bridgeInputAmountRaw) * BigInt(10000 + APPROVE_BUFFER_BPS)) / BigInt(10000);

    const {
      approveData,
      swapData,
      squidRouterQuoteId: quoteId
    } = await createOfframpSquidrouterTransactionsToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromNetwork: morphoNetwork,
      fromToken: morphoVault.depositAssetAddress as `0x${string}`,
      rawAmount: approveAmountRaw.toString(),
      toNetwork: Networks.Base,
      toToken: baseUsdcAddress as `0x${string}`
    });
    squidRouterQuoteId = quoteId;

    unsignedTxs.push({
      meta: {},
      network: morphoNetwork,
      nonce: morphoRedeemNonce++,
      phase: "squidRouterApprove",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(approveData) as EvmTransactionData
    });

    unsignedTxs.push({
      meta: {},
      network: morphoNetwork,
      nonce: morphoRedeemNonce++,
      phase: "squidRouterSwap",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(swapData) as EvmTransactionData
    });

    // 5. Cleanup USDC on the vault's chain so the funding account can sweep any leftovers.
    const vaultFundingAccount = getEvmFundingAccount(morphoNetwork);
    const vaultChainUsdcCleanup = await prepareBaseCleanupApproval(
      morphoVault.depositAssetAddress as `0x${string}`,
      vaultFundingAccount.address,
      morphoNetwork
    );
    unsignedTxs.push({
      meta: {},
      network: morphoNetwork,
      nonce: morphoRedeemNonce++,
      phase: "ethereumCleanupUsdc",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(vaultChainUsdcCleanup) as EvmTransactionData
    });
  }

  // 6. Mykobo intent (must precede any user-signed tx so failures abort early).
  const mykoboIntentValue = quote.metadata.nablaSwapEvm?.outputAmountDecimal;
  if (!mykoboIntentValue) {
    throw new Error("Missing nablaSwapEvm.outputAmountDecimal in quote metadata for Morpho offramp");
  }
  const mykoboFlooredValue = new Big(mykoboIntentValue).toFixed(2, 0);
  const eurcDecimals = evmTokenConfig[Networks.Base][EvmToken.EURC]?.decimals;
  if (eurcDecimals === undefined) {
    throw new Error("Invalid EURC decimals configuration for Base in evmTokenConfig");
  }
  const eurcTransferAmountRaw = multiplyByPowerOfTen(new Big(mykoboFlooredValue), eurcDecimals).toFixed(0, 0);

  const mykobo = MykoboApiService.getInstance();
  // const intent = await mykobo.createTransactionIntent({
  //   currency: MykoboCurrency.EURC,
  //   email_address: email,
  //   ip_address: ipAddress,
  //   transaction_type: MykoboTransactionType.WITHDRAW,
  //   value: mykoboFlooredValue,
  //   wallet_address: evmEphemeralEntry.address
  // });

  // if (!isWithdrawInstructions(intent.instructions)) {
  //   throw new Error("Mykobo intent did not return withdraw instructions; cannot derive receivables address");
  // }
  const mykoboReceivablesAddress = "0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877"; //intent.instructions.address;
  const mykoboTransactionId = "mockTransactionId"; //intent.transaction.id;
  const mykoboTransactionReference = "mockTransactionReference"; //intent.transaction.reference;

  // 7. Base leg (fundEphemeral handled separately; Nabla + payout + cleanups).
  //    When the vault IS on Base, the ephemeral has already broadcast transferFrom (nonce 0)
  //    and redeem (nonce 1) on Base via the morpho phases, so continue from morphoRedeemNonce.
  //    When the vault is on a different chain, no ephemeral txs have hit Base yet → start at 0.
  let baseNonce = isBaseVault ? morphoRedeemNonce : 0;

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

  const morphoRedeemMinOutputRaw = quote.metadata.redeemMeta?.expectedUsdcRaw
    ? (BigInt(quote.metadata.redeemMeta.expectedUsdcRaw) * BigInt(10000 - REDEEM_SLIPPAGE_BPS)) / BigInt(10000)
    : "0";

  stateMeta = {
    ...stateMeta,
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    morphoNetwork,
    morphoRedeemAssetAddress: morphoVault.depositAssetAddress,
    morphoRedeemMinOutputRaw: morphoRedeemMinOutputRaw.toString(),
    morphoRedeemSharesAmountRaw: sharesAmountRaw,
    morphoRedeemShareTokenAddress: morphoVault.vaultAddress,
    morphoRedeemVaultAddress: morphoVault.vaultAddress,
    mykoboEmail: email,
    mykoboReceivablesAddress,
    mykoboTransactionId,
    mykoboTransactionReference,
    phaseFlow: isBaseVault ? EUR_OFFRAMP_BASE_MORPHO : EUR_OFFRAMP_MORPHO,
    squidRouterQuoteId,
    walletAddress: userAddress
  };

  // TODO we're missing a backup path for the morpho redeem.

  if (userId) {
    await syncMykoboCustomerKyc(userId, email);
  }

  return { stateMeta, unsignedTxs };
}
