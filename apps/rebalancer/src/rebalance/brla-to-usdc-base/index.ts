import { multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import {
  BrlaToUsdcBaseRebalancePhase,
  BrlaToUsdcBaseStateManager,
  brlaToUsdcBasePhaseOrder
} from "../../services/stateManager.ts";
import { getBaseEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { checkInitialUsdcBalanceOnBase } from "../usdc-brla-usdc-base/steps.ts";
import { formatBrlaToUsdcBaseCompletionMessage } from "./notifications.ts";
import { mainNablaSwapUsdcToBrlaOnBase, nablaSwapBrlaToUsdcOnBase, verifyFinalUsdcBalanceOnBase } from "./steps.ts";

export async function rebalanceBrlaToUsdcBase(usdcAmountRaw: string, forceRestart = false) {
  console.log(`Starting USDC→BRLA→USDC rebalance on Base with amount: ${usdcAmountRaw} (raw USDC)`);

  const stateManager = new BrlaToUsdcBaseStateManager();
  let state = await stateManager.getState();
  console.log("Fetched rebalance state from storage.", state);

  const isResuming = !forceRestart && state && state.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle;
  if (isResuming) {
    console.log(`Resuming rebalance from phase: ${state?.currentPhase}`);
  } else {
    state = await stateManager.startNewRebalance(usdcAmountRaw);
  }

  if (!state) {
    throw new Error("State is undefined after initialization.");
  }

  const { publicClient: basePublicClient, walletClient: baseWalletClient } = getBaseEvmClients();
  const baseAddress = baseWalletClient.account.address;
  const baseNonce = await NonceManager.create(basePublicClient, baseAddress as `0x${string}`);

  const currentOrder = brlaToUsdcBasePhaseOrder[state.currentPhase];
  console.log(`Current phase order: ${currentOrder}`);

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.CheckInitialUsdcBalance]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 1");

    const initialBalance = await checkInitialUsdcBalanceOnBase(state.usdcAmountRaw);
    state.initialUsdcBalance = initialBalance.toString();
    state.currentPhase = BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 2");

    await mainNablaSwapUsdcToBrlaOnBase(state.usdcAmountRaw, baseNonce, state, stateManager);

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc]) {
    if (!state.mainNablaBrlaReceivedRaw) throw new Error("State corrupted: mainNablaBrlaReceivedRaw missing for step 3");

    await nablaSwapBrlaToUsdcOnBase(state.mainNablaBrlaReceivedRaw, baseNonce, state, stateManager);

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.VerifyFinalBalance;
    await stateManager.saveState(state);
  }

  if (currentOrder <= brlaToUsdcBasePhaseOrder[BrlaToUsdcBaseRebalancePhase.VerifyFinalBalance]) {
    const finalBalance = await verifyFinalUsdcBalanceOnBase();
    state.finalUsdcBalance = finalBalance.toString();

    state.currentPhase = BrlaToUsdcBaseRebalancePhase.Idle;
    await stateManager.saveState(state);
  }

  if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing at completion");
  if (!state.usdcReceivedRaw) throw new Error("State corrupted: usdcReceivedRaw missing at completion");
  if (!state.mainNablaBrlaReceivedRaw) throw new Error("State corrupted: mainNablaBrlaReceivedRaw missing at completion");

  const usdcIn = multiplyByPowerOfTen(Big(state.usdcAmountRaw), -6);
  const brlaIntermediate = multiplyByPowerOfTen(Big(state.mainNablaBrlaReceivedRaw), -18);
  const usdcOut = multiplyByPowerOfTen(Big(state.usdcReceivedRaw), -6);
  const cost = usdcIn.minus(usdcOut);
  const costRelative = usdcIn.gt(0) ? cost.div(usdcIn).toFixed(4, 0) : "N/A";

  console.log(
    `Rebalance completed! USDC in: ${usdcIn.toFixed(6)}, BRLA intermediate: ${brlaIntermediate.toFixed(6)}, USDC out: ${usdcOut.toFixed(6)}`
  );
  console.log(`Cost: absolute: ${cost.toFixed(6)} USDC | relative: ${costRelative}`);

  await stateManager.addHistoryEntry({
    cost: cost.toFixed(6),
    costRelative,
    endingTime: new Date().toISOString(),
    initialAmount: state.usdcAmountRaw,
    startingTime: state.startingTime
  });

  const slackNotifier = new SlackNotifier(process.env.SLACK_WEB_HOOK_TOKEN);
  await slackNotifier.sendMessage({
    text: formatBrlaToUsdcBaseCompletionMessage({
      brlaIntermediate,
      cost,
      usdcIn,
      usdcOut
    })
  });
}
