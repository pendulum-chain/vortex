import {
  FiatToken,
  getAnyFiatTokenDetails,
  getAnyFiatTokenDetailsMoonbeam,
  PENDULUM_USDC_AXL,
  type PendulumTokenDetails
} from "@packages/shared";
import Big from "big.js";
import { polygon } from "viem/chains";
import { checkEvmBalancePeriodically } from "../helpers/evm/balance.ts";
import { signAndSubmitSubstrateTransaction } from "../helpers/signing.ts";
import { BrlaApiService } from "../services/brla/brlaApiService.ts";
import { createNablaTransactions } from "../services/nabla";
import { multiplyByPowerOfTen } from "../services/nabla/helpers.ts";
import { getTokenOutAmount } from "../services/nabla/outAmount.ts";
import { createPendulumToMoonbeamTransfer } from "../services/xcm/pendulumToMoonbeam.ts";
import ApiManager from "../utils/api-manager.ts";
import { getConfig, getPendulumAccount, getPolygonAccount } from "../utils/config.ts";

const usdcTokenDetails = PENDULUM_USDC_AXL;
const brlaFiatTokenDetails = getAnyFiatTokenDetails(FiatToken.BRL);
const brlaEvmTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

/// Takes care of rebalancing an overfull BRLA pool on Pendulum with the axl.USDC pool on Pendulum.
/// @param amountAxlUsdc - The amount of USDC.axl to swap to BRLA initially.
export async function rebalanceBrlaToUsdcAxl(amountAxlUsdc: string) {
  console.log("Rebalancing BRLA to USDC.axl...");

  // 1. Swap USDC.axl in to get BRLA out
  // const outputAmount = await swapAxlusdcToBrla(amountAxlUsdc);

  const outputAmount = Big(2.5); // For testing purposes, we use a fixed amount of 2.5 BRLA
  const outputAmountRaw = multiplyByPowerOfTen(outputAmount, brlaFiatTokenDetails.decimals).toFixed(0, 0);

  // console.log(`${amountAxlUsdc} USDC.axl swapped to ${outputAmount.toFixed(4, 0)} BRLA.`);
  //
  // // 2. Send BRLA to Moonbeam via XCM
  // const hash = await sendBrlaToMoonbeam(outputAmount, brlaFiatTokenDetails.pendulumRepresentative);
  // console.log("BRLA sent to Moonbeam via XCM. Transaction hash:", hash);
  //
  // // 3. Wait for tokens to be automatically teleported to owned account on Polygon
  const { brlaBusinessAccountAddress } = getConfig();
  // console.log(
  //   `Waiting for ${outputAmount.toFixed(4, 0)} BRLA to be teleported to Polygon account ${brlaBusinessAccountAddress}...`
  // );
  // await checkEvmBalancePeriodically(
  //   brlaEvmTokenDetails.polygonErc20Address,
  //   brlaBusinessAccountAddress,
  //   outputAmountRaw,
  //   1_000, // 1 second
  //   5 * 60 * 1_000, // 5 minutes
  //   polygon
  // );
  // console.log(`${outputAmount.toFixed(4, 0)} BRLA successfully teleported to Polygon account.`);

  // 4. Send BRLA tokens from business to controlled account on Polygon using BRLA API
  const polygonAccount = getPolygonAccount();
  console.log(
    `Sending ${outputAmount.toFixed(4, 0)} BRLA from business account ${brlaBusinessAccountAddress} to controlled account on Polygon ${polygonAccount.address}...`
  );
  const brlaApiService = BrlaApiService.getInstance();
  await brlaApiService.transferBrlaToDestination(polygonAccount.address, outputAmount, "Polygon");

  console.log(`Waiting for ${outputAmount.toFixed(4, 0)} BRLA to be transferred to controlled account on Polygon...`);
  await checkEvmBalancePeriodically(
    brlaEvmTokenDetails.polygonErc20Address,
    polygonAccount.address,
    outputAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    polygon
  );

  // 5. Swap BRLA via Squidrouter to USDC.axl on Moonbeam

  // 6. Send USDC.axl back to the original account on Pendulum
}

async function swapAxlusdcToBrla(amount: string) {
  console.log(`Swapping ${amount} USDC.axl to BRLA...`);

  const api = await ApiManager.getApi("pendulum");

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

  const { approve, swap } = await createNablaTransactions(
    amountRaw,
    callerAddress,
    usdcTokenDetails,
    brlaFiatTokenDetails.pendulumRepresentative,
    minOutputRaw
  );

  console.log("Approving USDC.axl for swap...");
  await signAndSubmitSubstrateTransaction(approve.transaction, pendulumAccount, api);
  console.log("USDC.axl approved for swap.");

  console.log("Swapping USDC.axl to BRLA...");
  await signAndSubmitSubstrateTransaction(swap.transaction, pendulumAccount, api);
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

  const api = await ApiManager.getApi("pendulum");
  return signAndSubmitSubstrateTransaction(xcmTransfer, getPendulumAccount(), api);
}
