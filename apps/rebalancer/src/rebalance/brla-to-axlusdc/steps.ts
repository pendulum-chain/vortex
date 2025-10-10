// @ts-nocheck

import {
  ApiManager,
  BrlaApiService,
  checkEvmBalancePeriodically,
  createNablaTransactionsForOfframp,
  createOfframpSquidrouterTransactions,
  createPendulumToMoonbeamTransfer,
  decodeSubmittableExtrinsic,
  EvmToken,
  EvmTokenDetails,
  encodePayload,
  getEvmTokenBalance,
  getOnChainTokenDetails,
  getStatusAxelarScan,
  getTokenOutAmount,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
  multiplyByPowerOfTen,
  Networks,
  PendulumTokenDetails,
  signAndSubmitXcm,
  waitUntilTrue
} from "@packages/shared";
import splitReceiverABI from "@packages/shared/src/contracts/moonbeam/splitReceiverABI.json";
import { signExtrinsic, submitExtrinsic } from "@pendulum-chain/api-solang";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import { brlaFiatTokenDetails, brlaMoonbeamTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { getConfig, getMoonbeamEvmClients, getPendulumAccount, getPolygonEvmClients } from "../../utils/config.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";

export async function checkInitialPendulumBalance(pendulumAddress: string, requiredAmount: string): Promise<Big> {
  const apiManager = ApiManager.getInstance();
  const pendulumNode = await apiManager.getApi("pendulum");
  // @ts-ignore
  const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumAddress, usdcTokenDetails.currencyId);

  // @ts-ignore
  const currentBalance = multiplyByPowerOfTen(Big(balanceResponse?.free?.toString() ?? "0"), -usdcTokenDetails.decimals);
  console.log(`Current axl.USDC balance on Pendulum: ${currentBalance.toFixed(4, 0)} USDC.axl.`);
  if (currentBalance.lt(requiredAmount)) {
    throw new Error(`Not enough USDC.axl on Pendulum account. Current balance: ${currentBalance.toFixed(4, 0)} USDC.axl.`);
  }

  return currentBalance;
}

export async function swapAxlusdcToBrla(amount: string): Promise<Big> {
  console.log(`Swapping ${amount} USDC.axl to BRLA...`);

  const apiManager = await ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  const expectedAmountOut = await getTokenOutAmount({
    api,
    fromAmountString: amount,
    inputTokenPendulumDetails: usdcTokenDetails,
    outputTokenPendulumDetails: brlaFiatTokenDetails.pendulumRepresentative
  });

  if (!expectedAmountOut.preciseQuotedAmountOut) {
    throw new Error("Failed to get expected amount out for the swap.");
  }

  console.log(
    `Expected amount out for ${amount} USDC.axl: ${expectedAmountOut.preciseQuotedAmountOut.preciseBigDecimal.toFixed(4, 0)} BRLA.`
  );

  const pendulumAccount = getPendulumAccount();
  const callerAddress = pendulumAccount.address;

  const amountRaw = multiplyByPowerOfTen(amount, usdcTokenDetails.decimals).toFixed(0, 0);
  const minOutputRaw = expectedAmountOut.preciseQuotedAmountOut.rawBalance.times(0.95).toFixed(0, 0); // 5% slippage tolerance

  const { approve, swap } = await createNablaTransactionsForOfframp(
    amountRaw,
    { address: callerAddress, network: Networks.Pendulum },
    usdcTokenDetails,
    brlaFiatTokenDetails.pendulumRepresentative,
    minOutputRaw
  );

  console.log("Approving USDC.axl for swap...");
  const approvalExtrinsic = decodeSubmittableExtrinsic(approve.transaction, api);
  await signExtrinsic(approvalExtrinsic, { keypair: pendulumAccount, type: "keypair" });
  const approvalResult = await submitExtrinsic(approvalExtrinsic);
  if (approvalResult.status.type === "error") {
    throw new Error("Failed to approve USDC.axl for swap.");
  }
  console.log("USDC.axl approved for swap.");

  console.log("Swapping USDC.axl to BRLA...");
  const swapExtrinsic = decodeSubmittableExtrinsic(swap.transaction, api);
  await signExtrinsic(swapExtrinsic, { keypair: pendulumAccount, type: "keypair" });
  const swapResult = await submitExtrinsic(swapExtrinsic);
  if (swapResult.status.type === "error") {
    throw new Error("Failed to swap USDC.axl to BRLA.");
  }
  console.log("USDC.axl swapped to BRLA successfully.");

  return expectedAmountOut.preciseQuotedAmountOut.preciseBigDecimal;
}

export async function sendBrlaToMoonbeam(brlaAmount: Big, brlaTokenDetails: PendulumTokenDetails): Promise<string> {
  console.log(`Sending ${brlaAmount.toFixed(4, 0)} BRLA to Moonbeam via XCM...`);

  const config = getConfig();
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmount, brlaTokenDetails.decimals).toFixed(0, 0);

  const xcmTransfer = await createPendulumToMoonbeamTransfer(
    config.brlaBusinessAccountAddress,
    brlaAmountRaw,
    brlaTokenDetails.currencyId
  );

  const pendulumAccount = getPendulumAccount();
  const result = await signAndSubmitXcm(pendulumAccount, xcmTransfer);
  return result.hash;
}

export async function waitForBrlaOnPolygon(brlaAmount: Big, brlaAmountRaw: string): Promise<void> {
  const { brlaBusinessAccountAddress } = getConfig();
  console.log(
    `Waiting for ${brlaAmount.toFixed(4, 0)} BRLA to be teleported to Polygon account ${brlaBusinessAccountAddress}...`
  );
  await checkEvmBalancePeriodically(
    brlaMoonbeamTokenDetails.polygonErc20Address,
    brlaBusinessAccountAddress,
    brlaAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    Networks.Polygon
  );
  console.log(`${brlaAmount.toFixed(4, 0)} BRLA successfully teleported to Polygon account.`);
}

export async function transferBrlaOnPolygon(brlaAmount: Big, brlaAmountRaw: string): Promise<void> {
  const { walletClient: polygonWalletClient } = getPolygonEvmClients();
  const { brlaBusinessAccountAddress } = getConfig();
  console.log(
    `Sending ${brlaAmount.toFixed(4, 0)} BRLA from business account ${brlaBusinessAccountAddress} to controlled account on Polygon ${polygonWalletClient.account.address}...`
  );
  const brlaApiService = BrlaApiService.getInstance();
  await brlaApiService.transferBrlaToDestination(polygonWalletClient.account.address, brlaAmount, "Polygon");

  console.log(`Waiting for ${brlaAmount.toFixed(4, 0)} BRLA to be transferred to controlled account on Polygon...`);
  await checkEvmBalancePeriodically(
    brlaMoonbeamTokenDetails.polygonErc20Address,
    polygonWalletClient.account.address,
    brlaAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    Networks.Polygon
  );
}

export async function transferUsdcToMoonbeamWithSquidrouter(usdcAmountRaw: string, pendulumAddress: string) {
  console.log(`Transferring ${usdcAmountRaw} USDC to Moonbeam via SquidRouter...`);

  const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();

  const usdcTokenDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDCE) as EvmTokenDetails;
  const toTokenDetails = getOnChainTokenDetails(Networks.Moonbeam, EvmToken.AXLUSDC) as EvmTokenDetails;

  const { approveData, swapData, squidRouterReceiverId, route } = await createOfframpSquidrouterTransactions({
    fromAddress: polygonWalletClient.account.address,
    fromNetwork: Networks.Polygon,
    fromToken: usdcTokenDetails.erc20AddressSourceChain,
    pendulumAddressDestination: pendulumAddress,
    rawAmount: usdcAmountRaw,
    toToken: toTokenDetails.erc20AddressSourceChain
  });

  const approveDataExtended = {
    account: polygonWalletClient.account,
    chain: polygon,
    data: approveData.data,
    gas: BigInt(approveData.gas),
    maxFeePerGas: approveData.maxFeePerGas ? BigInt(approveData.maxFeePerGas) * 5n : BigInt(187500000000),
    maxPriorityFeePerGas: approveData.maxPriorityFeePerGas
      ? BigInt(approveData.maxPriorityFeePerGas) * 5n
      : BigInt(187500000000),
    to: approveData.to,
    value: BigInt(approveData.value)
  };

  console.log("Approving BRLA for swap on Polygon...");
  const approveHash = await polygonWalletClient.sendTransaction(approveDataExtended);
  console.log(`BRLA approval for swap on Polygon sent with transaction hash: ${approveHash}. Waiting for confirmation...`);
  await waitForTransactionConfirmation(approveHash, polygonPublicClient);
  console.log("BRLA approved for swap on Polygon. Transaction hash:", approveHash);

  const swapDataExtended = {
    account: polygonWalletClient.account,
    chain: polygon,
    data: swapData.data,
    gas: BigInt(swapData.gas),
    maxFeePerGas: swapData.maxFeePerGas ? BigInt(swapData.maxFeePerGas) * 5n : BigInt(187500000000),
    maxPriorityFeePerGas: swapData.maxPriorityFeePerGas ? BigInt(swapData.maxPriorityFeePerGas) * 5n : BigInt(187500000000),
    to: swapData.to,
    value: BigInt(swapData.value)
  };

  console.log("Swapping BRLA to USDC.axl on Moonbeam via Squidrouter...");
  const swapHash = await polygonWalletClient.sendTransaction(swapDataExtended);
  console.log(`BRLA swap to USDC.axl on Moonbeam sent with transaction hash: ${swapHash}. Waiting for confirmation...`);
  await waitForTransactionConfirmation(swapHash, polygonPublicClient);
  console.log("BRLA swapped to USDC.axl on Moonbeam via Squidrouter. Transaction hash:", swapHash);

  // Wait until the swap is executed on Axelar
  let isExecuted = false;
  while (!isExecuted) {
    const axelarScanStatus = await getStatusAxelarScan(swapHash);

    if (!axelarScanStatus) {
      console.log(`No Axelar status found for swap hash ${swapHash}.`);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds before checking again
      continue;
    }
    if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
      isExecuted = true;
      console.log(`Transaction ${swapHash} successfully executed on Axelar.`);
      break;
    }
  }

  return { amountUsd: route.estimate.toAmountUSD, squidRouterReceiverId };
}

/// Swaps BRLA to USDC on BRLA API service and transfer them to the receiver address.
export async function swapBrlaToUsdcOnBrlaApiService(brlaAmount: Big, receiverAddress: `0x${string}`) {
  const amountInCents = brlaAmount.mul(100).toFixed(0, 0); // Convert to cents as BRLA API expects amounts in cents
  const fastQuoteParams: FastQuoteQueryParams = {
    amount: Number(amountInCents),
    chain: BrlaSupportedChain.Polygon,
    fixOutput: false,
    inputCoin: "BRLA",
    operation: "swap",
    outputCoin: "USDC",
    subaccountId: undefined // We do the swap on the business account, so no subaccount ID is needed
  };

  const brlaApiService = BrlaApiService.getInstance();
  const quote = await brlaApiService.createFastQuote(fastQuoteParams);
  console.log(`Created fast quote for swapping ${brlaAmount.toFixed(4, 0)} BRLA to USDC.axl:`, quote);

  // Get USDC balance of receiver before the swap. BRLA is using USDCe on Polygon, so we need to check USDCe balance.
  const usdcDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDCE) as EvmTokenDetails;
  const receiverBalanceBeforeRaw = await getEvmTokenBalance({
    chain: Networks.Polygon,
    ownerAddress: receiverAddress,
    tokenAddress: usdcDetails.erc20AddressSourceChain
  });
  console.log(`Receiver USDC balance before swap: ${receiverBalanceBeforeRaw} USDC`);

  const { id } = await brlaApiService.swapRequest({
    receiverAddress,
    token: quote.token
  });

  console.log("Swap request created on BRLA API service with ID:", id);

  // Wait a couple seconds for the swap to be processed on BRLA API service
  await new Promise(resolve => setTimeout(resolve, 10_000));

  // Find transaction receipt
  let success = false;
  let txHash: string | undefined;
  const maxRetries = 5;
  const retryDelayMs = 60_000; // 60 seconds

  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    if (retryCount > 0) {
      console.log(`Swap transaction hash not found for ID: ${id}. Retry ${retryCount}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }

    const swapHistory = await brlaApiService.getSwapHistory(undefined);
    const swapLog = swapHistory.find(tx => tx.id === id);
    success = Boolean(swapLog?.smartContractOps[0]?.feedback.success);
    txHash = swapLog?.smartContractOps[0]?.tx;

    if (success && txHash) {
      if (retryCount > 0) {
        console.log(`Found transaction hash on retry ${retryCount}: ${txHash}`);
      }
      break;
    }

    if (retryCount === maxRetries) {
      throw new Error(`Swap transaction hash not found for ID: ${id} after ${maxRetries} retries.`);
    }
  }

  if (!txHash) throw new Error(`Swap transaction hash not found for ID: ${id}.`);

  const { publicClient: polygonPublicClient } = getPolygonEvmClients();
  console.log(`Waiting for swap transaction ${txHash} to be confirmed on Polygon...`);
  await waitForTransactionConfirmation(txHash, polygonPublicClient, 3);
  console.log(`Swap transaction ${txHash} confirmed on Polygon.`);

  return { amountUsd: quote.amountUsd, fee: quote.baseFee, rate: quote.basePrice };
}

export async function triggerXcmFromMoonbeam(squidRouterReceiverId: string, pendulumAddress: string): Promise<void> {
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumAddress));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const data = encodeFunctionData({
    abi: splitReceiverABI,
    args: [squidRouterReceiverId, squidRouterPayload],
    functionName: "executeXCM"
  });

  const { walletClient: moonbeamWalletClient, publicClient: moonbeamPublicClient } = getMoonbeamEvmClients();
  const { maxFeePerGas, maxPriorityFeePerGas } = await moonbeamPublicClient.estimateFeesPerGas();
  console.log("Sending transaction to make XCM call to Pendulum via Receiver contract...");
  console.log("'ExecuteXCM' args:", [squidRouterReceiverId, squidRouterPayload]);
  const xcmHash = await moonbeamWalletClient.sendTransaction({
    data,
    maxFeePerGas,
    maxPriorityFeePerGas,
    to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
    value: 0n
  });
  console.log(`USDC.axl sent to Pendulum via Receiver contract with transaction hash: ${xcmHash}. Waiting for confirmation...`);
  await waitForTransactionConfirmation(xcmHash, moonbeamPublicClient);
  console.log("USDC.axl successfully sent to Pendulum via Receiver contract. Transaction hash:", xcmHash);
}

export async function waitForAxlUsdcOnPendulum(
  expectedAmountToReceive: Big,
  pendulumAddress: string,
  initialBalance: Big
): Promise<void> {
  const apiManager = ApiManager.getInstance();
  const pendulumNode = await apiManager.getApi("pendulum");

  const didInputTokenArriveOnPendulum = async () => {
    // @ts-ignore
    const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumAddress, usdcTokenDetails.currencyId);

    // @ts-ignore
    const newBalance = multiplyByPowerOfTen(Big(balanceResponse?.free?.toString() ?? "0"), -usdcTokenDetails.decimals);

    // Check that newBalance is again almost equal to the old current balance but with some small difference due to fees
    const tolerance = 0.05; // 5% tolerance
    const lowerBound = initialBalance.add(expectedAmountToReceive.times(1 - tolerance));
    const upperBound = initialBalance.add(expectedAmountToReceive.times(1 + tolerance));
    return newBalance.gte(lowerBound) && newBalance.lte(upperBound);
  };

  console.log(`Waiting for USDC to arrive on Pendulum account ${pendulumAddress}...`);
  await waitUntilTrue(didInputTokenArriveOnPendulum, 5000);
  console.log("USDC successfully arrived on Pendulum account.");
}
