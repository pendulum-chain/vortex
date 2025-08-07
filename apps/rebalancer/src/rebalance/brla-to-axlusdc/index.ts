import { multiplyByPowerOfTen, SlackNotifier } from "@packages/shared";
import Big from "big.js";
import { brlaFiatTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { getPendulumAccount, getPolygonEvmClients } from "../../utils/config.ts";
import {
  checkInitialPendulumBalance,
  sendBrlaToMoonbeam,
  swapAxlusdcToBrla,
  swapBrlaToUsdcOnBrlaApiService,
  transferBrlaOnPolygon,
  transferUsdcToMoonbeamWithSquidrouter,
  triggerXcmFromMoonbeam,
  waitForAxlUsdcOnPendulum,
  waitForBrlaOnPolygon
} from "./steps.ts";

/// Takes care of rebalancing an overfull BRLA pool on Pendulum with the axl.USDC pool on Pendulum.
/// @param amountAxlUsdc - The amount of USDC.axl to swap to BRLA initially.
export async function rebalanceBrlaToUsdcAxl(amountAxlUsdc: string) {
  console.log(`Starting rebalance from BRLA to USDC.axl with amount: ${amountAxlUsdc}`);

  const pendulumAccount = getPendulumAccount();
  const { walletClient: polygonWalletClient } = await getPolygonEvmClients();
  const polygonAccountAddress = polygonWalletClient.account.address;

  // Step 1: Check initial balance
  const initialBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);

  // Step 2: Swap USDC.axl to BRLA on Pendulum
  // We make sure that only 2 decimals are used in the BRLA amount because the BRLA API service expects amounts in cents
  // and we don't need more precision than that.
  const brlaAmount = Big((await swapAxlusdcToBrla(amountAxlUsdc)).toFixed(2, 0));
  console.log(`Swapped ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA`);

  // Step 3: Send BRLA to Moonbeam via XCM
  await sendBrlaToMoonbeam(brlaAmount, brlaFiatTokenDetails.pendulumRepresentative);
  console.log(`Sent ${brlaAmount} BRLA to Moonbeam`);

  // Calculate raw amount for subsequent steps
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmount, brlaFiatTokenDetails.decimals).toFixed(0, 0);

  // Step 4: Wait for BRLA to appear on Polygon (automatic teleportation)
  await waitForBrlaOnPolygon(brlaAmount, brlaAmountRaw);
  console.log(`BRLA appeared on Polygon: ${brlaAmount}`);

  // Step 5: Swap BRLA to USDC.e on Polygon via BRLA API service and send to custom Polygon account
  const brlaToUsdcSwapQuote = await swapBrlaToUsdcOnBrlaApiService(brlaAmount, polygonAccountAddress as `0x${string}`);
  console.log(`Swapped ${brlaAmount} BRLA to USDC.e on Polygon with a rate of ${brlaToUsdcSwapQuote.rate} USDC.e per BRLA`);

  const usdcAmountRaw = multiplyByPowerOfTen(brlaToUsdcSwapQuote.amountUsd, usdcTokenDetails.decimals).toFixed(0, 0);

  // Step 6: Swap and transfer USDC.e from Polygon to USDC.axl on Moonbeam using SquidRouter
  const { squidRouterReceiverId, amountUsd } = await transferUsdcToMoonbeamWithSquidrouter(
    usdcAmountRaw,
    pendulumAccount.address
  );
  console.log(`Swapped BRLA to USDC.axl on Polygon, receiver ID: ${squidRouterReceiverId}`);

  // Step 7: Trigger XCM from Moonbeam to send USDC.axl back to Pendulum
  // Wait for 30 seconds to ensure the SquidRouter transaction is processed
  await new Promise(resolve => setTimeout(resolve, 30000));
  await triggerXcmFromMoonbeam(squidRouterReceiverId, pendulumAccount.address);
  console.log("Triggered XCM from Moonbeam to Pendulum");

  // Step 8: Wait for USDC.axl to arrive on Pendulum
  await waitForAxlUsdcOnPendulum(Big(amountUsd), pendulumAccount.address, initialBalance);
  console.log("USDC.axl arrived on Pendulum");

  const finalBalance = await checkInitialPendulumBalance(pendulumAccount.address, "0");
  const rebalancingCost = initialBalance.sub(finalBalance);

  console.log(
    `Rebalance from BRLA to USDC.axl completed successfully! Initial balance: ${initialBalance.toFixed(4, 0)}, final balance: ${finalBalance.toFixed(4, 0)}`
  );
  console.log(`Rebalanced ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA and back to ${amountUsd} USDC.axl`);
  console.log(
    `Rebalancing cost: absolute: ${rebalancingCost.toFixed(6)} | relative: ${Big(1).sub(finalBalance.div(initialBalance)).toFixed(4, 0)}`
  );

  const slackNotifier = new SlackNotifier();
  await slackNotifier.sendMessage({
    text:
      `Rebalance from BRLA to USDC.axl completed successfully! Initial balance: ${initialBalance.toFixed(4, 0)}, final balance: ${finalBalance.toFixed(4, 0)}\n` +
      `Rebalanced ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA and back to ${amountUsd} USDC.axl\n` +
      `Rebalancing cost: absolute: ${rebalancingCost.toFixed(6)} | relative: ${Big(1).sub(finalBalance.div(initialBalance)).toFixed(4, 0)}`
  });
}
