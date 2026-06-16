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
import { erc20Abi } from "viem";
import { base } from "viem/chains";
import { BrlaToUsdcBaseRebalanceState, BrlaToUsdcBaseStateManager } from "../../services/stateManager.ts";
import { getBaseEvmClients, getConfig } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";

export const USDC_BASE: `0x${string}` = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const NABLA_SWAP_DEADLINE_MINUTES = 60 * 24 * 7;
const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

const NABLA_QUOTE_ABI = [
  {
    inputs: [
      { name: "_amountIn", type: "uint256" },
      { name: "_tokenPath", type: "address[]" },
      { name: "_routerPath", type: "address[]" }
    ],
    name: "quoteSwapExactTokensForTokens",
    outputs: [{ name: "amountOut_", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// BRLA→USDC swap uses the BRLA Nabla pool (not the main pool)
const BRLA_NABLA_ROUTER = NABLA_ROUTER_BASE_BRLA;
const BRLA_NABLA_QUOTER = NABLA_QUOTER_BASE_BRLA;

export async function getUsdcBalanceOnBaseRaw(): Promise<string> {
  const { publicClient, walletClient } = getBaseEvmClients();
  const balance = await publicClient.readContract({
    abi: erc20Abi,
    address: USDC_BASE,
    args: [walletClient.account.address],
    functionName: "balanceOf"
  });
  return balance.toString();
}

export async function getBrlaBalanceOnBaseRaw(): Promise<string> {
  const { publicClient, walletClient } = getBaseEvmClients();
  const balance = await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_BRLA_BASE,
    args: [walletClient.account.address],
    functionName: "balanceOf"
  });
  return balance.toString();
}

import { checkInitialUsdcBalanceOnBase } from "../usdc-brla-usdc-base/steps.ts";

export async function quoteMainNablaUsdcToBrlaOnBase(usdcAmountRaw: string): Promise<string> {
  const { router, quoter } = getMainNablaConfig();
  const evmClientManager = EvmClientManager.getInstance();

  const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
    abi: MAIN_NABLA_QUOTE_ABI,
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

    if (!approveHash) {
      console.log("Sending BRLA Nabla approve transaction on Base...");
      const { maxFeePerGas: approveFee, maxPriorityFeePerGas: approveTip } = await publicClient.estimateFeesPerGas();
      approveHash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: base,
        data: approve.data,
        gas: BigInt(approve.gas),
        maxFeePerGas: approveFee,
        maxPriorityFeePerGas: approveTip,
        nonce: baseNonce.next(),
        to: approve.to,
        value: BigInt(approve.value)
      });
      state.nablaApproveHash = approveHash;
      await stateManager.saveState(state);
      console.log(`Approve tx sent: ${approveHash}`);
    } else {
      console.log(`Resuming BRLA Nabla approval with existing tx: ${approveHash}`);
    }

    await waitForTransactionConfirmation(approveHash, publicClient);
    console.log("BRLA Nabla approval confirmed.");

    console.log("Sending BRLA Nabla swap transaction on Base...");
    const { maxFeePerGas: swapFee, maxPriorityFeePerGas: swapTip } = await publicClient.estimateFeesPerGas();
    swapHash = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: base,
      data: swap.data,
      gas: BigInt(swap.gas),
      maxFeePerGas: swapFee,
      maxPriorityFeePerGas: swapTip,
      nonce: baseNonce.next(),
      to: swap.to,
      value: BigInt(swap.value)
    });
    state.nablaSwapHash = swapHash;
    await stateManager.saveState(state);
    console.log(`Swap tx sent: ${swapHash}`);
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

export async function verifyFinalUsdcBalanceOnBase(): Promise<Big> {
  const { walletClient } = getBaseEvmClients();
  const balanceRaw = await getUsdcBalanceOnBaseRaw();
  const balanceDecimal = multiplyByPowerOfTen(Big(balanceRaw), -6);
  console.log(`Final USDC balance on Base (${walletClient.account.address}): ${balanceDecimal.toFixed(6)} USDC`);
  return balanceDecimal;
}

// ── Main Nabla: USDC → BRLA swap (closes the rebalancing loop) ──────────────

const MAIN_NABLA_QUOTE_ABI = [
  {
    inputs: [
      { name: "_amountIn", type: "uint256" },
      { name: "_tokenPath", type: "address[]" },
      { name: "_routerPath", type: "address[]" }
    ],
    name: "quoteSwapExactTokensForTokens",
    outputs: [{ name: "amountOut_", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

function getMainNablaConfig() {
  const config = getConfig();
  if (!config.mainNablaRouter || !config.mainNablaQuoter) {
    throw new Error("Main Nabla route requires MAIN_NABLA_ROUTER and MAIN_NABLA_QUOTER env vars.");
  }
  return {
    quoter: config.mainNablaQuoter,
    router: config.mainNablaRouter
  };
}

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

    if (!approveHash) {
      console.log("Sending Main Nabla approve transaction on Base...");
      const { maxFeePerGas: approveFee, maxPriorityFeePerGas: approveTip } = await publicClient.estimateFeesPerGas();
      approveHash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: base,
        data: approve.data,
        gas: BigInt(approve.gas),
        maxFeePerGas: approveFee,
        maxPriorityFeePerGas: approveTip,
        nonce: baseNonce.next(),
        to: approve.to,
        value: BigInt(approve.value)
      });
      state.mainNablaApproveHash = approveHash;
      await stateManager.saveState(state);
      console.log(`Main Nabla approve tx sent: ${approveHash}`);
    } else {
      console.log(`Resuming Main Nabla approval with existing tx: ${approveHash}`);
    }

    await waitForTransactionConfirmation(approveHash, publicClient);
    console.log("Main Nabla approval confirmed.");

    console.log("Sending Main Nabla swap transaction on Base...");
    const { maxFeePerGas: swapFee, maxPriorityFeePerGas: swapTip } = await publicClient.estimateFeesPerGas();
    swapHash = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: base,
      data: swap.data,
      gas: BigInt(swap.gas),
      maxFeePerGas: swapFee,
      maxPriorityFeePerGas: swapTip,
      nonce: baseNonce.next(),
      to: swap.to,
      value: BigInt(swap.value)
    });
    state.mainNablaSwapHash = swapHash;
    await stateManager.saveState(state);
    console.log(`Main Nabla swap tx sent: ${swapHash}`);
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
