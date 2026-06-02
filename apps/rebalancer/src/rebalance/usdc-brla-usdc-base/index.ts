import { BrlaApiService, multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import { UsdcBaseRebalancePhase, UsdcBaseStateManager, usdcBasePhaseOrder } from "../../services/stateManager.ts";
import { getBaseEvmClients, getPolygonEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import {
  aveniaCreateSwapToUsdcBaseTicket,
  aveniaTransferBrlaToPolygon,
  checkInitialUsdcBalanceOnBase,
  checkTicketStatusPaid,
  compareRates,
  fetchAveniaQuote,
  fetchSquidRouterQuote,
  nablaApproveAndSwapOnBase,
  squidRouterApproveAndSwap,
  transferBrlaToAveniaOnBase,
  verifyFinalUsdcBalanceOnBase,
  waitBrlaOnPolygon,
  waitForBrlaOnAvenia,
  waitUsdcOnBase
} from "./steps.ts";

export async function rebalanceUsdcBrlaUsdcBase(
  usdcAmountRaw: string,
  forceRestart = false,
  forcedRoute?: "squidrouter" | "avenia"
) {
  console.log(`Starting USDC->BRLA->USDC rebalance on Base with amount: ${usdcAmountRaw} (raw USDC)`);

  const stateManager = new UsdcBaseStateManager();
  let state = await stateManager.getState();
  console.log("Fetched rebalance state from storage.", state);

  const isResuming = !forceRestart && state && state.currentPhase !== UsdcBaseRebalancePhase.Idle;
  if (isResuming) {
    console.log(`Resuming rebalance from phase: ${state?.currentPhase}`);
  } else {
    state = await stateManager.startNewRebalance(usdcAmountRaw);
  }

  if (!state) {
    throw new Error("State is undefined after initialization.");
  }

  const { publicClient: basePublicClient, walletClient: baseWalletClient } = getBaseEvmClients();
  const baseAddress = baseWalletClient.account.address as `0x${string}`;
  const baseNonce = await NonceManager.create(basePublicClient, baseAddress);

  const currentOrder = usdcBasePhaseOrder[state.currentPhase];
  console.log(`Current phase order: ${currentOrder}`);

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.CheckInitialUsdcBalance]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 1");

    const initialBalance = await checkInitialUsdcBalanceOnBase(state.usdcAmountRaw);
    state.initialUsdcBalance = initialBalance.toString();
    state.currentPhase = UsdcBaseRebalancePhase.NablaApprove;
    await stateManager.saveState(state);
  }

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.NablaApprove]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 2");

    const result = await nablaApproveAndSwapOnBase(state.usdcAmountRaw, baseNonce, state, stateManager);

    state.brlaAmountRaw = result.brlaAmountRaw;
    state.brlaAmountDecimal = result.brlaAmountDecimal.toString();

    console.log(`Nabla swap completed. BRLA received: ${result.brlaAmountDecimal.toFixed(4)}`);
    state.currentPhase = UsdcBaseRebalancePhase.TransferBrlaToAvenia;
    await stateManager.saveState(state);
  }

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.TransferBrlaToAvenia]) {
    if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for step 3");

    state.brlaTransferHash = await transferBrlaToAveniaOnBase(state.brlaAmountRaw, baseNonce, state, stateManager);

    console.log(`BRLA transferred to Avenia on Base. Tx: ${state.brlaTransferHash}`);
    state.currentPhase = UsdcBaseRebalancePhase.WaitForBrlaOnAvenia;
    await stateManager.saveState(state);
  }

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitForBrlaOnAvenia]) {
    if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for step 4");

    const actualBrlaBalance = await waitForBrlaOnAvenia(Big(state.brlaAmountDecimal));

    state.brlaAmountDecimal = actualBrlaBalance;
    state.brlaAmountRaw = multiplyByPowerOfTen(Big(actualBrlaBalance), 18).toFixed(0, 0);

    console.log("BRLA confirmed on Avenia internal balance.");
    state.currentPhase = UsdcBaseRebalancePhase.CompareRates;
    await stateManager.saveState(state);
  }

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.CompareRates]) {
    if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for step 5");

    if (forcedRoute) {
      console.log(`Forced route: ${forcedRoute}. Fetching quote for forced route only.`);

      state.winningRoute = forcedRoute;
      if (forcedRoute === "squidrouter") {
        state.squidRouterQuoteUsdc = await fetchSquidRouterQuote(Big(state.brlaAmountDecimal));
      } else {
        state.aveniaQuoteUsdc = await fetchAveniaQuote(Big(state.brlaAmountDecimal));
      }
    } else {
      const rateComparison = await compareRates(Big(state.brlaAmountDecimal));
      state.winningRoute = rateComparison.winningRoute;
      state.squidRouterQuoteUsdc = rateComparison.squidRouterQuoteUsdc;
      state.aveniaQuoteUsdc = rateComparison.aveniaQuoteUsdc;
    }

    console.log(`Rate comparison complete. Winner: ${state.winningRoute}`);

    if (state.winningRoute === "squidrouter") {
      state.currentPhase = UsdcBaseRebalancePhase.AveniaTransferToPolygon;
    } else {
      state.currentPhase = UsdcBaseRebalancePhase.AveniaSwapToUsdcBase;
    }
    await stateManager.saveState(state);
  }

  if (state.winningRoute === "avenia") {
    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.AveniaSwapToUsdcBase]) {
      if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for avenia step 1");

      const brlaApiService = BrlaApiService.getInstance();

      if (!state.aveniaTicketId) {
        try {
          const result = await aveniaCreateSwapToUsdcBaseTicket(Big(state.brlaAmountDecimal), baseAddress);
          state.aveniaTicketId = result.ticketId;
          state.aveniaQuoteUsdc = result.outputAmount;
          await stateManager.saveState(state);
        } catch (error) {
          console.error("Avenia swap ticket creation failed. Falling back to SquidRouter route.", error);
          state.winningRoute = "squidrouter";
          state.currentPhase = UsdcBaseRebalancePhase.AveniaTransferToPolygon;
          await stateManager.saveState(state);
        }
      }

      if (state.winningRoute === "avenia" && state.aveniaTicketId) {
        console.log(`Checking status for Avenia swap ticket ${state.aveniaTicketId}...`);
        const paidTicket = await checkTicketStatusPaid(brlaApiService, state.aveniaTicketId);
        state.aveniaQuoteUsdc = paidTicket.quote.outputAmount;
        console.log(`Avenia swap completed. USDC output: ${state.aveniaQuoteUsdc}`);

        state.currentPhase = UsdcBaseRebalancePhase.WaitUsdcOnBaseFromAvenia;
        await stateManager.saveState(state);
      }
    }

    if (!state.winningRoute) {
      throw new Error(`State corrupted: winningRoute is null at phase ${state.currentPhase}. Cannot proceed.`);
    }

    if (state.winningRoute === "avenia") {
      if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitUsdcOnBaseFromAvenia]) {
        if (!state.aveniaQuoteUsdc) throw new Error("State corrupted: aveniaQuoteUsdc missing for avenia step 2");

        const aveniaUsdcRaw = multiplyByPowerOfTen(Big(state.aveniaQuoteUsdc), 6).toFixed(0, 0);
        await waitUsdcOnBase(aveniaUsdcRaw);

        console.log("USDC from Avenia confirmed on Base.");
        state.currentPhase = UsdcBaseRebalancePhase.VerifyFinalBalance;
        await stateManager.saveState(state);
      }
    }
  }

  if (state.winningRoute === "squidrouter") {
    const { publicClient: polygonPublicClient, walletClient: polygonWalletClient } = getPolygonEvmClients();
    const polygonNonce = await NonceManager.create(polygonPublicClient, polygonWalletClient.account.address as `0x${string}`);

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.AveniaTransferToPolygon]) {
      if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for squid step 1");

      if (!state.aveniaTicketId) {
        const ticketId = await aveniaTransferBrlaToPolygon(Big(state.brlaAmountDecimal));
        state.aveniaTicketId = ticketId;
        await stateManager.saveState(state);
      }

      const brlaApiService = BrlaApiService.getInstance();
      await checkTicketStatusPaid(brlaApiService, state.aveniaTicketId);

      console.log("BRLA transferred to Polygon via Avenia.");
      state.currentPhase = UsdcBaseRebalancePhase.WaitBrlaOnPolygon;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitBrlaOnPolygon]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for squid step 2");

      await waitBrlaOnPolygon(state.brlaAmountRaw);

      console.log("BRLA confirmed on Polygon.");
      state.currentPhase = UsdcBaseRebalancePhase.SquidRouterApproveAndSwap;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.SquidRouterApproveAndSwap]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for squid step 3");

      const result = await squidRouterApproveAndSwap(state.brlaAmountRaw, baseAddress, polygonNonce, state, stateManager);

      state.squidRouterSwapHash = result.swapHash;
      console.log(`SquidRouter swap completed. Tx: ${result.swapHash}`);
      state.currentPhase = UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid]) {
      if (!state.squidRouterQuoteUsdc) throw new Error("State corrupted: squidRouterQuoteUsdc missing for squid step 4");

      await waitUsdcOnBase(state.squidRouterQuoteUsdc);

      console.log("USDC from SquidRouter confirmed on Base.");
      state.currentPhase = UsdcBaseRebalancePhase.VerifyFinalBalance;
      await stateManager.saveState(state);
    }
  }

  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.VerifyFinalBalance]) {
    const finalBalance = await verifyFinalUsdcBalanceOnBase();
    state.finalUsdcBalance = finalBalance.toString();

    state.currentPhase = UsdcBaseRebalancePhase.Idle;
    await stateManager.saveState(state);
  }

  if (!state.initialUsdcBalance) throw new Error("State corrupted: initialUsdcBalance missing at completion");
  if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing at completion");
  if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing at completion");
  if (!state.finalUsdcBalance) throw new Error("State corrupted: finalUsdcBalance missing at completion");

  const initialUsdcDecimal = Big(state.initialUsdcBalance);
  const finalUsdcDecimal = Big(state.finalUsdcBalance);
  const usdcRebalanced = Big(state.usdcAmountRaw).div(10 ** 6);
  const cost = initialUsdcDecimal.minus(finalUsdcDecimal);
  const costRelative = usdcRebalanced.gt(0) ? cost.div(usdcRebalanced).toFixed(4, 0) : "N/A";

  console.log(
    `Rebalance completed! Initial: ${initialUsdcDecimal.toFixed(6)} USDC, Final: ${finalUsdcDecimal.toFixed(6)} USDC`
  );
  console.log(`Route taken: ${state.winningRoute}`);
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
    text:
      "--------------------------------------------------" +
      "\n" +
      "✅ USDC->BRLA->USDC rebalance on Base completed!\n" +
      `🛤️ Route: ${state.winningRoute}\n` +
      `💰 USDC rebalanced: ${usdcRebalanced.toFixed(6)}\n` +
      `📉 Cost - Absolute: ${cost.toFixed(6)} USDC | Relative: ${costRelative}` +
      "\n" +
      "--------------------------------------------------"
  });
}
