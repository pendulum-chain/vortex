import { multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import {
  BrlaToUsdcBaseRebalancePhase,
  BrlaToUsdcBaseStateManager,
  brlaToUsdcBasePhaseOrder
} from "../../services/stateManager.ts";
import { getBaseEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { formatBrlaToUsdcBaseCompletionMessage } from "./notifications.ts";
import {
  checkInitialBrlaBalanceOnBase,
  mainNablaSwapUsdcToBrlaOnBase,
  nablaSwapBrlaToUsdcOnBase,
  verifyFinalUsdcBalanceOnBase
} from "./steps.ts";

export async function rebalanceBrlaToUsdcBase(brlaAmountRaw: string, forceRestart = false) {
  console.log(`Starting BRLA->USDC rebalance on Base with amount: ${brlaAmountRaw} (raw BRLA)`);

  const stateManager = new BrlaToUsdcBaseStateManager();
  let state = await stateManager.getState();
  console.log("Fetched rebalance state from storage.", state);

  const isResuming = !forceRestart && state && state.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle;
  if (isResuming) {
    console.log(`Resuming rebalance from phase: ${state?.currentPhase}`);
  } else {
    state = await stateManager.startNewRebalance(brlaAmountRaw);
  }

  if (!state) {
    throw new Error("State is undefined after initialization.");
  }

  const { publicClient: basePublicClient, walletClient: baseWalletClient } = getBaseEvmClients();
  const baseAddress = baseWalletClient.account.address;
  const baseNonce = await NonceManager.create(basePublicClient, baseAddress as `0x${string}`);

  const currentOrder = brlaToUsdcBasePhaseOrder[state.currentPhase];
  console.log(`Current phase order: ${currentOrder}`);

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.CheckInitialBrlaBalance]) {
    if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for step 1");

    const initialBalance = await checkInitialBrlaBalanceOnBase(state.brlaAmountRaw);
    state.initialBrlaBalance = initialBalance.toString();
    state.currentPhase = BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc]) {
    if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for step 2");

    await nablaSwapBrlaToUsdcOnBase(state.brlaAmountRaw, baseNonce, state, stateManager);

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla]) {
    if (!state.usdcReceivedRaw) throw new Error("State corrupted: usdcReceivedRaw missing for main nabla step");

    await mainNablaSwapUsdcToBrlaOnBase(state.usdcReceivedRaw, baseNonce, state, stateManager);

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.VerifyFinalBalance;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.VerifyFinalBalance]) {
    const finalBalance = await verifyFinalUsdcBalanceOnBase();
    state.finalUsdcBalance = finalBalance.toString();

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.Idle;
    await stateManager.saveState(state);
  }

  if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing at completion");
  if (!state.usdcReceivedRaw) throw new Error("State corrupted: usdcReceivedRaw missing at completion");
  if (!state.mainNablaBrlaReceivedRaw) throw new Error("State corrupted: mainNablaBrlaReceivedRaw missing at completion");

  const brlaIn = multiplyByPowerOfTen(Big(state.brlaAmountRaw), -18);
  const usdcIntermediate = multiplyByPowerOfTen(Big(state.usdcReceivedRaw), -6);
  const brlaOut = multiplyByPowerOfTen(Big(state.mainNablaBrlaReceivedRaw), -18);
  const cost = brlaIn.minus(brlaOut);
  const costRelative = brlaIn.gt(0) ? cost.div(brlaIn).toFixed(4, 0) : "N/A";

  console.log(
    `Rebalance completed! BRLA in: ${brlaIn.toFixed(6)}, USDC intermediate: ${usdcIntermediate.toFixed(6)}, BRLA out: ${brlaOut.toFixed(6)}`
  );
  console.log(`Cost: absolute: ${cost.toFixed(6)} BRLA | relative: ${costRelative}`);

  await stateManager.addHistoryEntry({
    cost: cost.toFixed(6),
    costRelative,
    endingTime: new Date().toISOString(),
    initialAmount: state.brlaAmountRaw,
    startingTime: state.startingTime
  });

  const slackNotifier = new SlackNotifier(process.env.SLACK_WEB_HOOK_TOKEN);
  await slackNotifier.sendMessage({
    text: formatBrlaToUsdcBaseCompletionMessage({
      brlaIn,
      brlaOut,
      cost,
      usdcIntermediate
    })
  });
}
