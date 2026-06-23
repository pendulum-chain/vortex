import { BrlaApiService, multiplyByPowerOfTen, SlackNotifier } from "@vortexfi/shared";
import Big from "big.js";
import {
  UsdcBaseRebalancePhase,
  type UsdcBaseRebalanceState,
  UsdcBaseStateManager,
  usdcBasePhaseOrder
} from "../../services/stateManager.ts";
import { checkTicketStatusPaid, RetryableAveniaTicketStatusError } from "../../utils/brla.ts";
import { getBaseEvmClients, getConfig, getPolygonEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { evaluateFallbackRoutePolicy } from "./guards.ts";
import { formatBaseRebalanceCompletionMessage, type RebalancePolicySummary } from "./notifications.ts";
import {
  aveniaCreateSwapToUsdcBaseTicket,
  aveniaTransferBrlaToPolygon,
  checkInitialUsdcBalanceOnBase,
  compareRoutesUpfront,
  getAveniaBrlaBalanceDecimal,
  getBrlaBalanceOnPolygonRaw,
  getUsdcBalanceOnBaseRaw,
  mainNablaApproveAndSwap,
  nablaApproveAndSwapOnBase,
  squidRouterApproveAndSwap,
  transferBrlaToAveniaOnBase,
  verifyFinalUsdcBalanceOnBase,
  waitBrlaOnPolygon,
  waitForBrlaOnAvenia,
  waitUsdcOnBase
} from "./steps.ts";

interface OpportunisticFallbackContext {
  config: RebalancePolicySummary["config"];
  deviationBps: number;
  opportunisticMaxCostBps: number;
  requireProfit: boolean;
}

function getOpportunisticFallbackContext(
  state: UsdcBaseRebalanceState,
  policy: RebalancePolicySummary | undefined
): OpportunisticFallbackContext | null {
  if (policy?.opportunistic) {
    return {
      config: policy.config,
      deviationBps: policy.deviationBps ?? 0,
      opportunisticMaxCostBps: policy.config.opportunisticUsdcToBrlaMaxCostBps,
      requireProfit: policy.fallbackRequiresProfit ?? false
    };
  }

  if (!state.opportunisticUsdcToBrla) return null;

  const config = getConfig().rebalancingCostPolicy;
  return {
    config,
    deviationBps: state.opportunisticDeviationBps ?? 0,
    opportunisticMaxCostBps: state.opportunisticMaxCostBps ?? config.opportunisticUsdcToBrlaMaxCostBps,
    requireProfit: state.opportunisticRequiresProfit
  };
}

async function calculateRemainingBrlaForPolygonTransfer(brlaAmountRaw: string, polygonBaselineRaw: string): Promise<Big> {
  const currentPolygonBrlaRaw = Big(await getBrlaBalanceOnPolygonRaw());
  const arrivedDeltaRaw = currentPolygonBrlaRaw.minus(Big(polygonBaselineRaw));
  const alreadyArrivedRaw = arrivedDeltaRaw.gt(0) ? arrivedDeltaRaw : Big(0);
  const remainingRaw = Big(brlaAmountRaw).minus(alreadyArrivedRaw);

  if (remainingRaw.lte(0)) return Big(0);

  return multiplyByPowerOfTen(remainingRaw, -18);
}

export async function rebalanceUsdcBrlaUsdcBase(
  usdcAmountRaw: string,
  forceRestart = false,
  forcedRoute?: "squidrouter" | "avenia" | "nabla-main",
  policy?: RebalancePolicySummary
) {
  console.log(`Starting USDC->BRLA->USDC rebalance on Base with amount: ${usdcAmountRaw} (raw USDC)`);

  const stateManager = new UsdcBaseStateManager();
  let state = await stateManager.getState();
  console.log("Fetched rebalance state from storage.", state);

  const isResuming = !forceRestart && state && state.currentPhase !== UsdcBaseRebalancePhase.Idle;
  if (isResuming) {
    console.log(`Resuming rebalance from phase: ${state?.currentPhase}`);
  } else {
    state = await stateManager.startNewRebalance(usdcAmountRaw, {
      opportunisticDeviationBps: policy?.opportunistic ? (policy.deviationBps ?? 0) : undefined,
      opportunisticMaxCostBps: policy?.opportunistic ? policy.config.opportunisticUsdcToBrlaMaxCostBps : undefined,
      opportunisticRequiresProfit: policy?.opportunistic ? (policy.fallbackRequiresProfit ?? false) : undefined,
      opportunisticUsdcToBrla: policy?.opportunistic ?? false
    });
  }

  if (!state) {
    throw new Error("State is undefined after initialization.");
  }

  const { publicClient: basePublicClient, walletClient: baseWalletClient } = getBaseEvmClients();
  const baseAddress = baseWalletClient.account.address as `0x${string}`;
  const baseNonce = await NonceManager.create(basePublicClient, baseAddress);

  const currentOrder = usdcBasePhaseOrder[state.currentPhase];
  console.log(`Current phase order: ${currentOrder}`);

  // ── Step 1: Check initial USDC balance ──────────────────────────────────────
  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.CheckInitialUsdcBalance]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 1");

    const initialBalance = await checkInitialUsdcBalanceOnBase(state.usdcAmountRaw);
    state.initialUsdcBalance = initialBalance.toString();
    state.currentPhase = UsdcBaseRebalancePhase.CompareRates;
    await stateManager.saveState(state);
  }

  // ── Step 2: Compare all 3 routes upfront (before any swap) ──────────────────
  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.CompareRates]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 2");

    if (forcedRoute) {
      console.log(`Forced route: ${forcedRoute}. Skipping full comparison.`);
      state.winningRoute = forcedRoute;
      state.squidRouterQuoteUsdc = policy?.preflightQuotes?.squidRouterQuoteUsdc ?? null;
      state.aveniaQuoteUsdc = policy?.preflightQuotes?.aveniaQuoteUsdc ?? null;
      state.mainNablaQuoteUsdc = policy?.preflightQuotes?.mainNablaQuoteUsdc ?? null;
    } else {
      const comparison = await compareRoutesUpfront(state.usdcAmountRaw);
      state.winningRoute = comparison.winningRoute;
      state.squidRouterQuoteUsdc = comparison.squidRouterQuoteUsdc;
      state.aveniaQuoteUsdc = comparison.aveniaQuoteUsdc;
      state.mainNablaQuoteUsdc = comparison.mainNablaQuoteUsdc;
    }

    console.log(`Route selected: ${state.winningRoute}`);
    state.currentPhase = UsdcBaseRebalancePhase.NablaApprove;
    await stateManager.saveState(state);
  }

  // ── Step 3: Nabla swap USDC → BRLA on Base (common to all routes) ───────────
  if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.NablaApprove]) {
    if (!state.usdcAmountRaw) throw new Error("State corrupted: usdcAmountRaw missing for step 3");

    const result = await nablaApproveAndSwapOnBase(state.usdcAmountRaw, baseNonce, state, stateManager);

    state.brlaAmountRaw = result.brlaAmountRaw;
    state.brlaAmountDecimal = result.brlaAmountDecimal.toString();

    console.log(`Nabla swap completed. BRLA received: ${result.brlaAmountDecimal.toFixed(4)}`);

    if (state.winningRoute === "nabla-main") {
      state.currentPhase = UsdcBaseRebalancePhase.MainNablaApproveAndSwap;
    } else {
      state.currentPhase = UsdcBaseRebalancePhase.TransferBrlaToAvenia;
    }
    await stateManager.saveState(state);
  }

  // ── nabla-main route: swap BRL → USDC on main Nabla (terminal) ──────────────
  if (state.winningRoute === "nabla-main") {
    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.MainNablaApproveAndSwap]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for nabla-main step");

      await mainNablaApproveAndSwap(state.brlaAmountRaw, baseNonce, state, stateManager);

      console.log("Main Nabla swap completed. Proceeding to verify final balance.");
      state.currentPhase = UsdcBaseRebalancePhase.VerifyFinalBalance;
      await stateManager.saveState(state);
    }
  }

  // ── avenia/squid routes: transfer BRLA to Avenia, then diverge ──────────────
  if (state.winningRoute === "avenia" || state.winningRoute === "squidrouter") {
    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.TransferBrlaToAvenia]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for step 4");

      if (!state.aveniaBrlaBalanceBeforeTransfer) {
        state.aveniaBrlaBalanceBeforeTransfer = await getAveniaBrlaBalanceDecimal();
        await stateManager.saveState(state);
      }

      state.brlaTransferHash = await transferBrlaToAveniaOnBase(state.brlaAmountRaw, baseNonce, state, stateManager);

      console.log(`BRLA transferred to Avenia on Base. Tx: ${state.brlaTransferHash}`);
      state.currentPhase = UsdcBaseRebalancePhase.WaitForBrlaOnAvenia;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitForBrlaOnAvenia]) {
      if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for step 5");
      if (!state.aveniaBrlaBalanceBeforeTransfer) {
        throw new Error("State corrupted: aveniaBrlaBalanceBeforeTransfer missing for step 5");
      }

      const actualBrlaBalance = await waitForBrlaOnAvenia(
        Big(state.brlaAmountDecimal),
        Big(state.aveniaBrlaBalanceBeforeTransfer)
      );

      state.brlaAmountDecimal = actualBrlaBalance;
      state.brlaAmountRaw = multiplyByPowerOfTen(Big(actualBrlaBalance), 18).toFixed(0, 0);

      console.log("BRLA confirmed on Avenia internal balance.");

      if (state.winningRoute === "squidrouter") {
        state.currentPhase = UsdcBaseRebalancePhase.AveniaTransferToPolygon;
      } else {
        state.currentPhase = UsdcBaseRebalancePhase.AveniaSwapToUsdcBase;
      }
      await stateManager.saveState(state);
    }
  }

  // ── Avenia route: BRLA → USDC swap via Avenia on Base ───────────────────────
  if (state.winningRoute === "avenia") {
    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.AveniaSwapToUsdcBase]) {
      if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for avenia step 1");

      const brlaApiService = BrlaApiService.getInstance();

      if (!state.aveniaTicketId) {
        try {
          if (!state.baseUsdcBalanceBeforeAveniaSwapRaw) {
            state.baseUsdcBalanceBeforeAveniaSwapRaw = await getUsdcBalanceOnBaseRaw();
            await stateManager.saveState(state);
          }

          const result = await aveniaCreateSwapToUsdcBaseTicket(Big(state.brlaAmountDecimal), baseAddress);
          state.aveniaTicketId = result.ticketId;
          state.aveniaQuoteUsdc = result.outputAmount;
          await stateManager.saveState(state);
        } catch (error) {
          console.error("Avenia swap ticket creation failed. Falling back to SquidRouter route.", error);
          const opportunisticFallbackContext = getOpportunisticFallbackContext(state, policy);
          if (opportunisticFallbackContext) {
            if (!state.usdcAmountRaw)
              throw new Error("State corrupted: usdcAmountRaw missing for opportunistic fallback check");
            if (!state.squidRouterQuoteUsdc) {
              throw new Error("Opportunistic Avenia fallback blocked: SquidRouter was not quoted before execution.");
            }

            const fallbackPolicy = evaluateFallbackRoutePolicy(
              Big(state.usdcAmountRaw),
              Big(state.squidRouterQuoteUsdc),
              opportunisticFallbackContext.deviationBps,
              opportunisticFallbackContext.config,
              {
                opportunisticMaxCostBps: opportunisticFallbackContext.opportunisticMaxCostBps,
                requireOpportunisticCost: true,
                requireProfit: opportunisticFallbackContext.requireProfit
              }
            );
            if (!fallbackPolicy.shouldExecute) {
              throw new Error(`Opportunistic Avenia fallback blocked: ${fallbackPolicy.reason}`);
            }
          }

          state.winningRoute = "squidrouter";
          state.currentPhase = UsdcBaseRebalancePhase.AveniaTransferToPolygon;
          await stateManager.saveState(state);
        }
      }

      if (state.winningRoute === "avenia" && state.aveniaTicketId) {
        console.log(`Checking status for Avenia swap ticket ${state.aveniaTicketId}...`);
        const paidTicket = await checkTicketStatusPaid(brlaApiService, state.aveniaTicketId);
        // Avenia API returns outputAmount in decimal units.
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
        if (!state.baseUsdcBalanceBeforeAveniaSwapRaw) {
          throw new Error("State corrupted: baseUsdcBalanceBeforeAveniaSwapRaw missing for avenia step 2");
        }

        const aveniaUsdcRaw = multiplyByPowerOfTen(Big(state.aveniaQuoteUsdc), 6).toFixed(0, 0);
        state.aveniaQuoteUsdc = await waitUsdcOnBase(aveniaUsdcRaw, state.baseUsdcBalanceBeforeAveniaSwapRaw);

        console.log("USDC from Avenia confirmed on Base.");
        state.currentPhase = UsdcBaseRebalancePhase.VerifyFinalBalance;
        await stateManager.saveState(state);
      }
    }
  }

  // ── SquidRouter route: transfer BRLA to Polygon, then swap ──────────────────
  if (state.winningRoute === "squidrouter") {
    const { publicClient: polygonPublicClient, walletClient: polygonWalletClient } = getPolygonEvmClients();
    const polygonNonce = await NonceManager.create(polygonPublicClient, polygonWalletClient.account.address as `0x${string}`);

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.AveniaTransferToPolygon]) {
      if (!state.brlaAmountDecimal) throw new Error("State corrupted: brlaAmountDecimal missing for squid step 1");

      if (!state.aveniaTicketId) {
        if (!state.polygonBrlaBalanceBeforeTransferRaw) {
          state.polygonBrlaBalanceBeforeTransferRaw = await getBrlaBalanceOnPolygonRaw();
          await stateManager.saveState(state);
        }

        const ticketId = await aveniaTransferBrlaToPolygon(Big(state.brlaAmountDecimal));
        state.aveniaTicketId = ticketId;
        await stateManager.saveState(state);
      }

      const brlaApiService = BrlaApiService.getInstance();
      try {
        await checkTicketStatusPaid(brlaApiService, state.aveniaTicketId);
      } catch (error) {
        if (!(error instanceof RetryableAveniaTicketStatusError)) {
          throw error;
        }

        console.warn(
          `Avenia transfer ticket ${error.ticketId} reached retryable status ${error.status}. Creating a replacement ticket.`
        );
        if (!state.brlaAmountRaw)
          throw new Error("State corrupted: brlaAmountRaw missing while retrying Avenia Polygon ticket");
        if (!state.polygonBrlaBalanceBeforeTransferRaw) {
          throw new Error("State corrupted: polygonBrlaBalanceBeforeTransferRaw missing while retrying Avenia Polygon ticket");
        }

        const remainingBrlaDecimal = await calculateRemainingBrlaForPolygonTransfer(
          state.brlaAmountRaw,
          state.polygonBrlaBalanceBeforeTransferRaw
        );
        if (remainingBrlaDecimal.lte(0)) {
          console.log(
            "Avenia ticket failed after the full BRLA amount arrived on Polygon. Continuing to arrival confirmation."
          );
        } else {
          console.warn(`Retrying Avenia transfer to Polygon for remaining ${remainingBrlaDecimal.toFixed(4)} BRLA.`);
          state.aveniaTicketId = await aveniaTransferBrlaToPolygon(remainingBrlaDecimal);
          await stateManager.saveState(state);
          await checkTicketStatusPaid(brlaApiService, state.aveniaTicketId);
        }
      }

      console.log("BRLA transferred to Polygon via Avenia.");
      state.currentPhase = UsdcBaseRebalancePhase.WaitBrlaOnPolygon;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitBrlaOnPolygon]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for squid step 2");
      if (!state.polygonBrlaBalanceBeforeTransferRaw) {
        throw new Error("State corrupted: polygonBrlaBalanceBeforeTransferRaw missing for squid step 2");
      }

      const arrivedBrlaRaw = await waitBrlaOnPolygon(state.brlaAmountRaw, state.polygonBrlaBalanceBeforeTransferRaw);
      // Continue with whatever actually arrived (after Avenia fees).
      state.brlaAmountRaw = arrivedBrlaRaw;

      console.log("BRLA confirmed on Polygon.");
      state.currentPhase = UsdcBaseRebalancePhase.SquidRouterApproveAndSwap;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.SquidRouterApproveAndSwap]) {
      if (!state.brlaAmountRaw) throw new Error("State corrupted: brlaAmountRaw missing for squid step 3");

      if (!state.baseUsdcBalanceBeforeSquidSwapRaw) {
        state.baseUsdcBalanceBeforeSquidSwapRaw = await getUsdcBalanceOnBaseRaw();
        await stateManager.saveState(state);
      }

      const result = await squidRouterApproveAndSwap(state.brlaAmountRaw, baseAddress, polygonNonce, state, stateManager);

      state.squidRouterSwapHash = result.swapHash;
      state.squidRouterQuoteUsdc = result.toAmountRaw;
      console.log(`SquidRouter swap completed. Tx: ${result.swapHash}`);
      state.currentPhase = UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid;
      await stateManager.saveState(state);
    }

    if (currentOrder <= usdcBasePhaseOrder[UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid]) {
      if (!state.squidRouterQuoteUsdc) throw new Error("State corrupted: squidRouterQuoteUsdc missing for squid step 4");
      if (!state.baseUsdcBalanceBeforeSquidSwapRaw) {
        throw new Error("State corrupted: baseUsdcBalanceBeforeSquidSwapRaw missing for squid step 4");
      }

      state.squidRouterQuoteUsdc = await waitUsdcOnBase(state.squidRouterQuoteUsdc, state.baseUsdcBalanceBeforeSquidSwapRaw);

      console.log("USDC from SquidRouter confirmed on Base.");
      state.currentPhase = UsdcBaseRebalancePhase.VerifyFinalBalance;
      await stateManager.saveState(state);
    }
  }

  // ── Final: verify balance and report ────────────────────────────────────────
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
    text: formatBaseRebalanceCompletionMessage({
      brlaReceived: Big(state.brlaAmountDecimal),
      cost,
      finalUsdcBalance: finalUsdcDecimal,
      initialUsdcBalance: initialUsdcDecimal,
      policy: policy ?? { config: getConfig().rebalancingCostPolicy },
      requestedUsdc: usdcRebalanced,
      route: state.winningRoute
    })
  });
}
