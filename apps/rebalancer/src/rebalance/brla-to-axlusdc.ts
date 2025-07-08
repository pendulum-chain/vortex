import {
  decodeSubmittableExtrinsic,
  EvmTokenDetails,
  FiatToken,
  getAnyFiatTokenDetails,
  getAnyFiatTokenDetailsMoonbeam,
  Networks,
  PENDULUM_USDC_AXL,
  type PendulumTokenDetails,
  TokenType
} from "@packages/shared";
import { KeyPairSigner, signExtrinsic, submitExtrinsic } from "@pendulum-chain/api-solang";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";
import { encodeFunctionData, PublicClient } from "viem";
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
import { submitXcm } from "vortex-backend/src/api/services/xcm/send.ts";
import { MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from "vortex-backend/src/constants/constants";
import { getConfig, getMoonbeamEvmClients, getPendulumAccount, getPolygonEvmClients } from "../utils/config.ts";

const usdcTokenDetails = PENDULUM_USDC_AXL;
const brlaFiatTokenDetails = getAnyFiatTokenDetails(FiatToken.BRL);
const brlaMoonbeamTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

/// Takes care of rebalancing an overfull BRLA pool on Pendulum with the axl.USDC pool on Pendulum.
/// @param amountAxlUsdc - The amount of USDC.axl to swap to BRLA initially.
export async function rebalanceBrlaToUsdcAxl(amountAxlUsdc: string) {
  console.log("Rebalancing BRLA to USDC.axl...");

  // 1. Swap USDC.axl in to get BRLA out
  const outputAmount = await swapAxlusdcToBrla(amountAxlUsdc);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmount, brlaFiatTokenDetails.decimals).toFixed(0, 0);

  console.log(`${amountAxlUsdc} USDC.axl swapped to ${outputAmount.toFixed(4, 0)} BRLA.`);

  // 2. Send BRLA to Moonbeam via XCM
  const hash = await sendBrlaToMoonbeam(outputAmount, brlaFiatTokenDetails.pendulumRepresentative);
  console.log("BRLA sent to Moonbeam via XCM. Transaction hash:", hash);

  // 3. Wait for tokens to be automatically teleported to owned account on Polygon
  const { brlaBusinessAccountAddress } = getConfig();
  console.log(
    `Waiting for ${outputAmount.toFixed(4, 0)} BRLA to be teleported to Polygon account ${brlaBusinessAccountAddress}...`
  );
  await checkEvmBalancePeriodically(
    brlaMoonbeamTokenDetails.polygonErc20Address,
    brlaBusinessAccountAddress,
    outputAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    polygon
  );
  console.log(`${outputAmount.toFixed(4, 0)} BRLA successfully teleported to Polygon account.`);

  // 4. Send BRLA tokens from business to controlled account on Polygon using BRLA API
  const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();
  console.log(
    `Sending ${outputAmount.toFixed(4, 0)} BRLA from business account ${brlaBusinessAccountAddress} to controlled account on Polygon ${polygonAccount.address}...`
  );
  const brlaApiService = BrlaApiService.getInstance();
  await brlaApiService.transferBrlaToDestination(polygonWalletClient.account.address, outputAmount, "Polygon");

  console.log(`Waiting for ${outputAmount.toFixed(4, 0)} BRLA to be transferred to controlled account on Polygon...`);
  await checkEvmBalancePeriodically(
    brlaMoonbeamTokenDetails.polygonErc20Address,
    polygonWalletClient.account.address,
    outputAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    polygon
  );

  // 5. Swap BRLA via Squidrouter to USDC.axl on Moonbeam and send to Pendulum
  console.log(`Swapping ${outputAmount.toFixed(4, 0)} BRLA to USDC.axl on Moonbeam via Squidrouter...`);
  const pendulumAccount = getPendulumAccount();

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
    pendulumAddressDestination: pendulumAccount.address,
    rawAmount: outputAmountRaw
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

  // 6. Send USDC.axl to Pendulum via Receiver contract
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumAccount.address));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const data = encodeFunctionData({
    abi: splitReceiverABI,
    args: [squidRouterReceiverId, squidRouterPayload],
    functionName: "executeXCM"
  });

  const { walletClient: moonbeamWalletClient, publicClient: moonbeamPublicClient } = getMoonbeamEvmClients();
  const { maxFeePerGas, maxPriorityFeePerGas } = await moonbeamPublicClient.estimateFeesPerGas();
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

  // const apiManager = ApiManager.getInstance();
  // const pendulumNode = await apiManager.getApi("pendulum");
  // const didInputTokenArriveOnPendulum = async () => {
  //   // @ts-ignore
  //   const balanceResponse = await pendulumNode.api.query.tokens.accounts(
  //     pendulumAccount.address,
  //     brlaMoonbeamTokenDetails.pendulumRepresentative.currencyId
  //   );
  //
  //   // @ts-ignore
  //   const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
  //   return currentBalance.gt(Big(0));
  // };
  //
  // console.log(`Waiting for USDC to arrive on Pendulum account ${pendulumAccount.address}...`);
  // await waitUntilTrue(didInputTokenArriveOnPendulum, 5000);
  // console.log(`USDC successfully arrived on Pendulum account.`);
}

async function swapAxlusdcToBrla(amount: string) {
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

async function sendBrlaToMoonbeam(brlaAmount: Big, brlaTokenDetails: PendulumTokenDetails) {
  console.log(`Sending ${brlaAmount.toFixed(4, 0)} BRLA to Moonbeam via XCM...`);

  const config = getConfig();
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmount, brlaTokenDetails.decimals).toFixed(0, 0);

  const xcmTransfer = await createPendulumToMoonbeamTransfer(
    config.brlaBusinessAccountAddress,
    brlaAmountRaw,
    brlaTokenDetails.currencyId
  );

  return submitXcm(getPendulumAccount().address, xcmTransfer);
}

async function waitForTransactionConfirmation(txHash: string, publicClient: PublicClient): Promise<void> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`
    });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} failed or was not found`);
    }
  } catch (error) {
    throw new Error(`Error waiting for transaction confirmation: ${error}`);
  }
}
