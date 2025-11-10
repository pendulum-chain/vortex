import { multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import { brlaFiatTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { RebalancePhase, StateManager } from "../../services/stateManager.ts";
import { getMoonbeamEvmClients, getPendulumAccount, getPolygonEvmClients } from "../../utils/config.ts";
import {
  checkInitialPendulumBalance,
  pollForSufficientBalance,
  sendBrlaToMoonbeam,
  swapAxlusdcToBrla,
  swapBrlaToUsdcOnBrlaApiService,
  transferUsdcToMoonbeamWithSquidrouter,
  triggerXcmFromMoonbeam,
  waitForAxlUsdcOnPendulum
} from "./steps.ts";

/// Takes care of rebalancing an overfull BRLA pool on Pendulum with the axl.USDC pool on Pendulum.
/// @param amountAxlUsdc - The amount of USDC.axl to swap to BRLA initially.
export async function rebalanceBrlaToUsdcAxl(amountAxlUsdc: string) {
  console.log(`Starting rebalance from BRLA to USDC.axl with amount: ${amountAxlUsdc}`);

  const stateManager = new StateManager();
  let state = await stateManager.getState();
  state.startingTime = new Date().toISOString();
  state.currentPhase = RebalancePhase.CheckInitialPendulumBalance;
  await stateManager.saveState(state);

  const pendulumAccount = getPendulumAccount();
  const { walletClient: moonbeamWalletClient } = await getMoonbeamEvmClients();
  const moonbeamAccountAddress = moonbeamWalletClient.account.address;

  // Step 1: Check initial balance
  const initialBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);
  state = { ...state, currentPhase: RebalancePhase.SwapAxlusdcToBrla, initialBalance: initialBalance.toString() };
  await stateManager.saveState(state);

  // Step 2: Swap USDC.axl to BRLA on Pendulum
  const brlaAmount = Big((await swapAxlusdcToBrla(amountAxlUsdc)).toFixed(2, 0));
  console.log(`Swapped ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA`);
  state.currentPhase = RebalancePhase.SendBrlaToMoonbeam;
  await stateManager.saveState(state);

  // Step 3: Send BRLA to Moonbeam via XCM
  await sendBrlaToMoonbeam(brlaAmount, brlaFiatTokenDetails.pendulumRepresentative);
  console.log(`Sent ${brlaAmount} BRLA to Moonbeam`);
  state.currentPhase = RebalancePhase.PollForSufficientBalance;
  await stateManager.saveState(state);

  // Step 4: Wait for BRLA to appear on the internal Avenia balance.
  await pollForSufficientBalance(brlaAmount);
  console.log(`BRLA appeared on the internal Avenia balance: ${brlaAmount}`);
  state.currentPhase = RebalancePhase.SwapBrlaToUsdcOnBrlaApiService;
  await stateManager.saveState(state);

  // Step 5: Swap BRLA to USDC.e using Avenia, deposits swapped amount on polygon.
  const brlaToUsdcSwapQuote = await swapBrlaToUsdcOnBrlaApiService(brlaAmount, moonbeamAccountAddress as `0x${string}`);
  state.currentPhase = RebalancePhase.TransferUsdcToMoonbeamWithSquidrouter;
  await stateManager.saveState(state);

  const usdcAmountRaw = multiplyByPowerOfTen(brlaToUsdcSwapQuote.amountUsd, usdcTokenDetails.decimals).toFixed(0, 0);

  // Step 6: Swap and transfer USDC.e from Polygon to USDC.axl on Moonbeam using SquidRouter
  const { squidRouterReceiverId, amountUsd } = await transferUsdcToMoonbeamWithSquidrouter(
    usdcAmountRaw,
    pendulumAccount.address
  );
  console.log(`Swapped BRLA to USDC.axl on Polygon, receiver ID: ${squidRouterReceiverId}`);
  state = { ...state, currentPhase: RebalancePhase.TriggerXcmFromMoonbeam, squidRouterReceiverId, usdcAmountRaw };
  await stateManager.saveState(state);

  // Step 7: Trigger XCM from Moonbeam to send USDC.axl back to Pendulum
  // Wait for 30 seconds to ensure the SquidRouter transaction is processed
  await new Promise(resolve => setTimeout(resolve, 30000));
  await triggerXcmFromMoonbeam(squidRouterReceiverId, pendulumAccount.address);
  console.log("Triggered XCM from Moonbeam to Pendulum");
  state.currentPhase = RebalancePhase.WaitForAxlUsdcOnPendulum;
  await stateManager.saveState(state);

  // Step 8: Wait for USDC.axl to arrive on Pendulum
  await waitForAxlUsdcOnPendulum(pendulumAccount.address, initialBalance);
  console.log("USDC.axl arrived on Pendulum");
  state.currentPhase = RebalancePhase.Idle;
  await stateManager.saveState(state);

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
      `Rebalanced ${amountAxlUsdc} USDC.axl to ${brlaAmount} BRLA and back to ${brlaToUsdcSwapQuote.amountUsd} USDC.axl\n` +
      `Rebalancing cost: absolute: ${rebalancingCost.toFixed(6)} | relative: ${Big(1).sub(finalBalance.div(initialBalance)).toFixed(4, 0)}`
  });
}
