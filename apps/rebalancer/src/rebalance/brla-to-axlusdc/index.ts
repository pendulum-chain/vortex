import { multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import { brlaFiatTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { phaseOrder, RebalancePhase, RebalanceStateParsed, StateManager } from "../../services/stateManager.ts";
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
  console.log("Fetched rebalance state from storage.", state);

  const isResuming = state.currentPhase !== RebalancePhase.Idle;
  if (isResuming) {
    console.log(`Resuming rebalance from phase: ${state.currentPhase}`);
  } else {
    // Forcing reset state, to ensure a clean one.
    state = await stateManager.startNewRebalance(amountAxlUsdc);
  }

  const currentOrder = phaseOrder[state.currentPhase];
  console.log(`Current phase order: ${currentOrder}`);

  const pendulumAccount = getPendulumAccount();
  const { walletClient: moonbeamWalletClient } = await getMoonbeamEvmClients();
  const moonbeamAccountAddress = moonbeamWalletClient.account.address;

  // Step 1: Check initial balance
  if (currentOrder <= 1) {
    if (!state.amountAxlUsdc) throw new Error("State corrupted: amountAxlUsdc missing for step 1");

    state.initialBalance = await checkInitialPendulumBalance(pendulumAccount.address, state.amountAxlUsdc);

    state.currentPhase = RebalancePhase.SwapAxlusdcToBrla;
    await stateManager.saveState(state);
  }

  // Step 2: Swap USDC.axl to BRLA on Pendulum
  if (currentOrder <= 2) {
    if (!state.amountAxlUsdc) throw new Error("State corrupted: amountAxlUsdc missing for step 2");

    state.brlaAmount = Big((await swapAxlusdcToBrla(state.amountAxlUsdc)).toFixed(2, 0));

    console.log(`Swapped ${state.amountAxlUsdc} USDC.axl to ${state.brlaAmount} BRLA`);
    state.currentPhase = RebalancePhase.SendBrlaToMoonbeam;
    await stateManager.saveState(state);
  }

  // Step 3: Send BRLA to Moonbeam via XCM
  if (currentOrder <= 3) {
    if (!state.brlaAmount) throw new Error("State corrupted: brlaAmount missing for step 3");

    await sendBrlaToMoonbeam(state.brlaAmount, brlaFiatTokenDetails.pendulumRepresentative);
    console.log(`Sent ${state.brlaAmount} BRLA to Moonbeam`);
    state.currentPhase = RebalancePhase.PollForSufficientBalance;

    await stateManager.saveState(state);
  }

  // Step 4: Wait for BRLA to appear on the internal Avenia balance.
  if (currentOrder <= 4) {
    if (!state.brlaAmount) throw new Error("State corrupted: brlaAmount missing for step 4");

    await pollForSufficientBalance(state.brlaAmount);
    console.log(`BRLA appeared on the internal Avenia balance: ${state.brlaAmount}`);

    state.currentPhase = RebalancePhase.SwapBrlaToUsdcOnBrlaApiService;
    await stateManager.saveState(state);
  }

  // Step 5: Swap BRLA to USDC.e using Avenia, deposits swapped amount on polygon.
  if (currentOrder <= 5) {
    if (!state.brlaAmount) throw new Error("State corrupted: brlaAmount missing for step 5");

    const quote = await swapBrlaToUsdcOnBrlaApiService(state.brlaAmount, moonbeamAccountAddress as `0x${string}`);
    state.brlaToUsdcAmountUsd = quote.amountUsd;

    state.currentPhase = RebalancePhase.TransferUsdcToMoonbeamWithSquidrouter;
    await stateManager.saveState(state);
  }

  // Step 6: Swap and transfer USDC.e from Polygon to USDC.axl on Moonbeam using SquidRouter
  if (currentOrder <= 6) {
    if (!state.brlaToUsdcAmountUsd) throw new Error("State corrupted: brlaToUsdcAmountUsd missing for step 6");
    const usdcAmountRaw =
      state.usdcAmountRaw || multiplyByPowerOfTen(state.brlaToUsdcAmountUsd, usdcTokenDetails.decimals).toFixed(0, 0);

    const result = await transferUsdcToMoonbeamWithSquidrouter(usdcAmountRaw, pendulumAccount.address);
    const squidRouterReceiverId = result.squidRouterReceiverId;
    const amountUsd = result.amountUsd;
    console.log(`Swapped BRLA to USDC.axl on Polygon, receiver ID: ${squidRouterReceiverId}`);
    state = { ...state, currentPhase: RebalancePhase.TriggerXcmFromMoonbeam, squidRouterReceiverId, usdcAmountRaw };
    await stateManager.saveState(state);
  }

  // Step 7: Trigger XCM from Moonbeam to send USDC.axl back to Pendulum
  if (currentOrder <= 7) {
    if (!state.squidRouterReceiverId) throw new Error("State corrupted: squidRouterReceiverId missing for step 7");
    // Wait for 30 seconds to ensure the SquidRouter transaction is processed
    await new Promise(resolve => setTimeout(resolve, 30000));
    await triggerXcmFromMoonbeam(state.squidRouterReceiverId, pendulumAccount.address);
    console.log("Triggered XCM from Moonbeam to Pendulum");

    state.currentPhase = RebalancePhase.WaitForAxlUsdcOnPendulum;
    await stateManager.saveState(state);
  }

  // Step 8: Wait for USDC.axl to arrive on Pendulum
  if (currentOrder <= 8) {
    if (!state.initialBalance) throw new Error("State corrupted: initialBalance missing for step 8");

    await waitForAxlUsdcOnPendulum(pendulumAccount.address, state.initialBalance);
    console.log("USDC.axl arrived on Pendulum");

    state.currentPhase = RebalancePhase.Idle;
    await stateManager.saveState(state);
  }

  const finalBalance = await checkInitialPendulumBalance(pendulumAccount.address, "0");

  if (!state.initialBalance) throw new Error("State corrupted: initialBalance missing at completion");
  if (!state.amountAxlUsdc) throw new Error("State corrupted: amountAxlUsdc missing at completion");
  if (!state.brlaAmount) throw new Error("State corrupted: brlaAmount missing at completion");
  if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing at completion");
  if (!state.brlaToUsdcAmountUsd) throw new Error("State corrupted: brlaToUsdcAmountUsd missing at completion");

  const rebalancingCost = state.initialBalance.sub(finalBalance);

  console.log(
    `Rebalance from BRLA to USDC.axl completed successfully! Initial balance: ${state.initialBalance.toFixed(4, 0)}, final balance: ${finalBalance.toFixed(4, 0)}`
  );
  console.log(
    `Rebalanced ${state.amountAxlUsdc} USDC.axl to ${state.brlaAmount} BRLA and back to ${state.usdcAmountRaw} USDC.axl`
  );
  console.log(
    `Rebalancing cost: absolute: ${rebalancingCost.toFixed(6)} | relative: ${Big(1).sub(finalBalance.div(state.initialBalance)).toFixed(4, 0)}`
  );

  const slackNotifier = new SlackNotifier();
  await slackNotifier.sendMessage({
    text:
      `Rebalance from BRLA to USDC.axl completed successfully! Initial balance: ${state.initialBalance.toFixed(4, 0)}, final balance: ${finalBalance.toFixed(4, 0)}\n` +
      `Rebalanced ${state.amountAxlUsdc} USDC.axl to ${state.brlaAmount} BRLA and back to ${state.brlaToUsdcAmountUsd} USDC.axl\n` +
      `Rebalancing cost: absolute: ${rebalancingCost.toFixed(6)} | relative: ${Big(1).sub(finalBalance.div(state.initialBalance)).toFixed(4, 0)}`
  });
}
