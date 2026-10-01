import {
  createNablaTransactionsForOnrampOnEVM,
  EphemeralAccountType,
  ERC20_BRLA_BASE,
  EvmClientManager,
  multiplyByPowerOfTen,
  NABLA_QUOTER_BASE_BRLA,
  NABLA_ROUTER_BASE_BRLA,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { BrlaToUsdcBaseRebalanceState, BrlaToUsdcBaseStateManager } from "../../services/stateManager.ts";
import { getBaseEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";
import {
  getBrlaBalanceOnBaseRaw,
  getMainNablaConfig,
  getUsdcBalanceOnBaseRaw,
  NABLA_QUOTE_ABI,
  sendNablaApproveAndSwap,
  USDC_BASE
} from "../usdc-brla-usdc-base/steps.ts";

const NABLA_SWAP_DEADLINE_MINUTES = 60 * 24 * 7;
const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

// BRLA→USDC swap uses the BRLA Nabla pool (not the main pool)
const BRLA_NABLA_ROUTER = NABLA_ROUTER_BASE_BRLA;
const BRLA_NABLA_QUOTER = NABLA_QUOTER_BASE_BRLA;

export async function quoteMainNablaUsdcToBrlaOnBase(usdcAmountRaw: string): Promise<string> {
  const { router, quoter } = getMainNablaConfig();
  const evmClientManager = EvmClientManager.getInstance();

  const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
    abi: NABLA_QUOTE_ABI,
    address: quoter,
    args: [BigInt(usdcAmountRaw), [USDC_BASE, ERC20_BRLA_BASE], [router]],
    functionName: "quoteSwapExactTokensForTokens"
  });

  const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -18);
  console.log(`Main Nabla preflight quote: ${expectedOutputDecimal.toFixed(6)} BRLA`);
  return expectedOutputRaw.toString();
}

export async function quoteBrlaNablaToUsdcOnBase(brlaAmountRaw: string): Promise<string> {
  const evmClientManager = EvmClientManager.getInstance();

  const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
    abi: NABLA_QUOTE_ABI,
    address: BRLA_NABLA_QUOTER,
    args: [BigInt(brlaAmountRaw), [ERC20_BRLA_BASE, USDC_BASE], [BRLA_NABLA_ROUTER]],
    functionName: "quoteSwapExactTokensForTokens"
  });

  const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -6);
  console.log(`BRLA Nabla preflight quote: ${expectedOutputDecimal.toFixed(6)} USDC`);
  return expectedOutputRaw.toString();
}

export async function quoteBrlaToUsdcBaseRebalance(usdcAmountRaw: string): Promise<{
  estimatedBrlaRaw: string;
  projectedUsdcRaw: string;
}> {
  const estimatedBrlaRaw = await quoteMainNablaUsdcToBrlaOnBase(usdcAmountRaw);
  const projectedUsdcRaw = await quoteBrlaNablaToUsdcOnBase(estimatedBrlaRaw);

  return { estimatedBrlaRaw, projectedUsdcRaw };
}

export async function nablaSwapBrlaToUsdcOnBase(
  brlaAmountRaw: string,
  baseNonce: NonceManager,
  state: BrlaToUsdcBaseRebalanceState,
  stateManager: BrlaToUsdcBaseStateManager
): Promise<string> {
  const { walletClient, publicClient } = getBaseEvmClients();
  const executorAddress = walletClient.account.address;

  console.log(`Starting BRLA Nabla swap of ${brlaAmountRaw} BRLA (raw) to USDC on Base...`);

  if (state.nablaApproveHash && state.nablaSwapHash && state.usdcReceivedRaw) {
    console.log("Resuming BRLA Nabla swap with previously recorded hashes.");
    return state.usdcReceivedRaw;
  }

  if (state.nablaSwapHash && !state.usdcBalanceBeforeNablaRaw) {
    throw new Error("State corrupted: missing pre-Nabla USDC balance baseline for completed swap.");
  }

  if (!state.usdcBalanceBeforeNablaRaw) {
    state.usdcBalanceBeforeNablaRaw = await getUsdcBalanceOnBaseRaw();
    await stateManager.saveState(state);
  }
  const usdcBalanceBefore = BigInt(state.usdcBalanceBeforeNablaRaw);

  let approveHash = state.nablaApproveHash;
  let swapHash = state.nablaSwapHash;

  if (!swapHash) {
    const expectedOutputRaw = BigInt(await quoteBrlaNablaToUsdcOnBase(brlaAmountRaw));

    const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -6);
    console.log(`Expected USDC output: ${expectedOutputDecimal.toFixed(6)}`);

    const nablaHardMinimumOutputRaw = Big(expectedOutputRaw.toString())
      .mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN)
      .toFixed(0, 0);

    const { approve, swap } = await createNablaTransactionsForOnrampOnEVM(
      brlaAmountRaw,
      { address: executorAddress, type: EphemeralAccountType.EVM },
      ERC20_BRLA_BASE,
      USDC_BASE,
      nablaHardMinimumOutputRaw,
      NABLA_SWAP_DEADLINE_MINUTES,
      BRLA_NABLA_ROUTER
    );

    ({ approveHash, swapHash } = await sendNablaApproveAndSwap({
      approve,
      baseNonce,
      existingApproveHash: approveHash,
      label: "BRLA Nabla",
      onApproveSent: async hash => {
        state.nablaApproveHash = hash;
        await stateManager.saveState(state);
      },
      onSwapSent: async hash => {
        state.nablaSwapHash = hash;
        await stateManager.saveState(state);
      },
      publicClient,
      swap,
      walletClient
    }));
  } else {
    console.log(`Resuming BRLA Nabla swap with existing approve tx: ${approveHash}, swap tx: ${swapHash}`);
  }

  if (!approveHash || !swapHash) {
    throw new Error("State corrupted: BRLA Nabla transaction hash missing after swap step.");
  }

  await waitForTransactionConfirmation(swapHash, publicClient);
  console.log("BRLA Nabla swap confirmed.");

  await new Promise(resolve => setTimeout(resolve, 5_000));

  const usdcBalanceAfterRaw = await getUsdcBalanceOnBaseRaw();
  const usdcBalanceAfter = BigInt(usdcBalanceAfterRaw);
  const usdcReceivedRaw = (usdcBalanceAfter - usdcBalanceBefore).toString();

  if (BigInt(usdcReceivedRaw) <= 0n) {
    throw new Error(`No USDC delta detected after BRLA Nabla swap (pre: ${usdcBalanceBefore}, post: ${usdcBalanceAfter}).`);
  }

  const usdcReceivedDecimal = multiplyByPowerOfTen(Big(usdcReceivedRaw), -6);
  console.log(`Received ${usdcReceivedDecimal.toFixed(6)} USDC from BRLA Nabla swap.`);

  state.usdcReceivedRaw = usdcReceivedRaw;
  await stateManager.saveState(state);

  return usdcReceivedRaw;
}

// ── Main Nabla: USDC → BRLA swap (closes the rebalancing loop) ──────────────

export async function mainNablaSwapUsdcToBrlaOnBase(
  usdcAmountRaw: string,
  baseNonce: NonceManager,
  state: BrlaToUsdcBaseRebalanceState,
  stateManager: BrlaToUsdcBaseStateManager
): Promise<string> {
  const { router } = getMainNablaConfig();
  const { walletClient, publicClient } = getBaseEvmClients();
  const executorAddress = walletClient.account.address;

  console.log(`Starting Main Nabla swap of ${usdcAmountRaw} USDC (raw) to BRLA on Base...`);

  if (state.mainNablaApproveHash && state.mainNablaSwapHash && state.mainNablaBrlaReceivedRaw) {
    console.log("Resuming Main Nabla swap with previously recorded hashes.");
    return state.mainNablaBrlaReceivedRaw;
  }

  if (state.mainNablaSwapHash && !state.mainNablaBrlaBalanceBeforeRaw) {
    throw new Error("State corrupted: missing pre-Main-Nabla BRLA balance baseline for completed swap.");
  }

  if (!state.mainNablaBrlaBalanceBeforeRaw) {
    state.mainNablaBrlaBalanceBeforeRaw = await getBrlaBalanceOnBaseRaw();
    await stateManager.saveState(state);
  }
  const brlaBalanceBefore = BigInt(state.mainNablaBrlaBalanceBeforeRaw);

  let approveHash = state.mainNablaApproveHash;
  let swapHash = state.mainNablaSwapHash;

  if (!swapHash) {
    const expectedOutputRaw = BigInt(await quoteMainNablaUsdcToBrlaOnBase(usdcAmountRaw));

    const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -18);
    console.log(`Expected BRLA output from Main Nabla: ${expectedOutputDecimal.toFixed(6)}`);

    const nablaHardMinimumOutputRaw = Big(expectedOutputRaw.toString())
      .mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN)
      .toFixed(0, 0);

    const { approve, swap } = await createNablaTransactionsForOnrampOnEVM(
      usdcAmountRaw,
      { address: executorAddress, type: EphemeralAccountType.EVM },
      USDC_BASE,
      ERC20_BRLA_BASE,
      nablaHardMinimumOutputRaw,
      NABLA_SWAP_DEADLINE_MINUTES,
      router
    );

    ({ approveHash, swapHash } = await sendNablaApproveAndSwap({
      approve,
      baseNonce,
      existingApproveHash: approveHash,
      label: "Main Nabla",
      onApproveSent: async hash => {
        state.mainNablaApproveHash = hash;
        await stateManager.saveState(state);
      },
      onSwapSent: async hash => {
        state.mainNablaSwapHash = hash;
        await stateManager.saveState(state);
      },
      publicClient,
      swap,
      walletClient
    }));
  } else {
    console.log(`Resuming Main Nabla swap with existing approve tx: ${approveHash}, swap tx: ${swapHash}`);
  }

  if (!approveHash || !swapHash) {
    throw new Error("State corrupted: Main Nabla transaction hash missing after swap step.");
  }

  await waitForTransactionConfirmation(swapHash, publicClient);
  console.log("Main Nabla swap confirmed.");

  await new Promise(resolve => setTimeout(resolve, 5_000));

  const brlaBalanceAfterRaw = await getBrlaBalanceOnBaseRaw();
  const brlaBalanceAfter = BigInt(brlaBalanceAfterRaw);
  const brlaReceivedRaw = (brlaBalanceAfter - brlaBalanceBefore).toString();

  if (BigInt(brlaReceivedRaw) <= 0n) {
    throw new Error(`No BRLA delta detected after Main Nabla swap (pre: ${brlaBalanceBefore}, post: ${brlaBalanceAfter}).`);
  }

  const brlaReceivedDecimal = multiplyByPowerOfTen(Big(brlaReceivedRaw), -18);
  console.log(`Received ${brlaReceivedDecimal.toFixed(6)} BRLA from Main Nabla swap.`);

  state.mainNablaBrlaReceivedRaw = brlaReceivedRaw;
  await stateManager.saveState(state);

  return brlaReceivedRaw;
}
