import { multiplyByPowerOfTen } from "vortex-backend/src/api/helpers/contracts.ts";
import { brlaFiatTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { getPendulumAccount } from "../../utils/config.ts";
import {
  checkInitialPendulumBalance,
  sendBrlaToMoonbeam,
  swapAxlusdcToBrla,
  swapBrlaToAxlUsdcOnPolygon,
  transferBrlaOnPolygon,
  triggerXcmFromMoonbeam,
  waitForAxlUsdcOnPendulum,
  waitForBrlaOnPolygon
} from "./steps.ts";

/// Takes care of rebalancing an overfull BRLA pool on Pendulum with the axl.USDC pool on Pendulum.
/// @param amountAxlUsdc - The amount of USDC.axl to swap to BRLA initially.
export async function rebalanceBrlaToUsdcAxl(amountAxlUsdc: string) {
  console.log(`Starting rebalance from BRLA to USDC.axl with amount: ${amountAxlUsdc}`);

  const pendulumAccount = getPendulumAccount();

  // Step 1: Check initial balance
  const initialBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);

  // Step 2: Swap USDC.axl to BRLA on Pendulum
  const brlaAmount = await swapAxlusdcToBrla(amountAxlUsdc);
  console.log(`Swapped ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA`);

  // Step 3: Send BRLA to Moonbeam via XCM
  await sendBrlaToMoonbeam(brlaAmount, brlaFiatTokenDetails.pendulumRepresentative);
  console.log(`Sent ${brlaAmount} BRLA to Moonbeam`);

  // Calculate raw amount for subsequent steps
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmount, brlaFiatTokenDetails.decimals).toFixed(0, 0);

  // Step 4: Wait for BRLA to appear on Polygon (automatic teleportation)
  await waitForBrlaOnPolygon(brlaAmount, brlaAmountRaw);
  console.log(`BRLA appeared on Polygon: ${brlaAmount}`);

  // Step 5: Transfer BRLA on Polygon using BRLA API service
  await transferBrlaOnPolygon(brlaAmount, brlaAmountRaw);
  console.log(`Transferred ${brlaAmount} BRLA on Polygon`);

  // Step 6: Swap BRLA to USDC.axl on Polygon via Squidrouter
  const squidRouterReceiverId = await swapBrlaToAxlUsdcOnPolygon(brlaAmountRaw, pendulumAccount.address);
  console.log(`Swapped BRLA to USDC.axl on Polygon, receiver ID: ${squidRouterReceiverId}`);

  // Step 7: Trigger XCM from Moonbeam to send USDC.axl back to Pendulum
  await triggerXcmFromMoonbeam(squidRouterReceiverId, pendulumAccount.address);
  console.log(`Triggered XCM from Moonbeam to Pendulum`);

  // Step 8: Wait for USDC.axl to arrive on Pendulum
  await waitForAxlUsdcOnPendulum(pendulumAccount.address, initialBalance);
  console.log(`USDC.axl arrived on Pendulum`);

  console.log(`Rebalance completed successfully`);
}
