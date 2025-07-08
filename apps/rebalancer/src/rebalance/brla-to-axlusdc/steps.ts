import { decodeSubmittableExtrinsic, EvmTokenDetails, Networks, type PendulumTokenDetails, TokenType } from "@packages/shared";
import { signExtrinsic, submitExtrinsic } from "@pendulum-chain/api-solang";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import splitReceiverABI from "vortex-backend/mooncontracts/splitReceiverABI.json";
import { multiplyByPowerOfTen } from "vortex-backend/src/api/helpers/contracts.ts";
import { waitUntilTrue } from "vortex-backend/src/api/helpers/functions.ts";
import { BrlaApiService } from "vortex-backend/src/api/services/brla/brlaApiService.ts";
import { checkEvmBalancePeriodically } from "vortex-backend/src/api/services/moonbeam/balance.ts";
import { getTokenOutAmount } from "vortex-backend/src/api/services/nablaReads/outAmount.ts";
import { ApiManager } from "vortex-backend/src/api/services/pendulum/apiManager.ts";
import { createNablaTransactionsForOfframp } from "vortex-backend/src/api/services/transactions/nabla";
import { createOfframpSquidrouterTransactions } from "vortex-backend/src/api/services/transactions/squidrouter/offramp.ts";
import encodePayload from "vortex-backend/src/api/services/transactions/squidrouter/payload.ts";
import { createPendulumToMoonbeamTransfer } from "vortex-backend/src/api/services/transactions/xcm/pendulumToMoonbeam";
import { signAndSubmitXcm } from "vortex-backend/src/api/services/xcm/send.ts";
import { MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from "vortex-backend/src/constants/constants";
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
    polygon
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
    polygon
  );
}

export async function swapBrlaToAxlUsdcOnPolygon(brlaAmountRaw: string, pendulumAddress: string): Promise<string> {
  console.log(`Swapping BRLA to USDC.axl on Moonbeam via Squidrouter...`);

  const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();

  const brlaEvmTokenDetails: EvmTokenDetails = {
    assetSymbol: "BRLA",
    decimals: brlaMoonbeamTokenDetails.decimals,
    erc20AddressSourceChain: brlaMoonbeamTokenDetails.polygonErc20Address as `0x${string}`,
    isNative: false,
    network: Networks.Polygon,
    networkAssetIcon: "polygonBRLA",
    pendulumRepresentative: brlaFiatTokenDetails.pendulumRepresentative,
    type: TokenType.Evm
  };

  const { approveData, swapData, squidRouterReceiverId } = await createOfframpSquidrouterTransactions({
    fromAddress: polygonWalletClient.account.address,
    fromNetwork: Networks.Polygon,
    inputTokenDetails: brlaEvmTokenDetails,
    pendulumAddressDestination: pendulumAddress,
    rawAmount: brlaAmountRaw
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

  return squidRouterReceiverId;
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

export async function waitForAxlUsdcOnPendulum(pendulumAddress: string, initialBalance: Big): Promise<void> {
  const apiManager = ApiManager.getInstance();
  const pendulumNode = await apiManager.getApi("pendulum");

  const didInputTokenArriveOnPendulum = async () => {
    // @ts-ignore
    const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumAddress, usdcTokenDetails.currencyId);

    // @ts-ignore
    const newBalance = multiplyByPowerOfTen(Big(balanceResponse?.free?.toString() ?? "0"), -usdcTokenDetails.decimals);
    // Check that newBalance is again almost equal to the old current balance but with some small difference due to fees
    return newBalance.gt(initialBalance.times(0.95)) && newBalance.lt(initialBalance.times(1.05));
  };

  console.log(`Waiting for USDC to arrive on Pendulum account ${pendulumAddress}...`);
  await waitUntilTrue(didInputTokenArriveOnPendulum, 5000);
  console.log(`USDC successfully arrived on Pendulum account.`);
}
