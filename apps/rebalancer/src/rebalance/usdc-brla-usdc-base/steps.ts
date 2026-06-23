import {
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  createNablaTransactionsForOnrampOnEVM,
  createTransactionDataFromRoute,
  EphemeralAccountType,
  ERC20_BRLA_BASE,
  EvmClientManager,
  getNablaBasePool,
  getNetworkId,
  getRoute,
  getStatusAxelarScan,
  multiplyByPowerOfTen,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, type PublicClient } from "viem";
import { base, polygon } from "viem/chains";
import { brlaMoonbeamTokenDetails } from "../../constants.ts";
import { UsdcBaseRebalanceState, UsdcBaseStateManager, type WinningRoute } from "../../services/stateManager.ts";
import { getBaseEvmClients, getConfig, getPolygonEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";
import { calculateMinimumDelta, calculateTargetBalanceRaw, DEFAULT_ARRIVAL_TOLERANCE } from "./guards.ts";

export const USDC_BASE: `0x${string}` = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BRLA_POLYGON: `0x${string}` = brlaMoonbeamTokenDetails.polygonErc20Address as `0x${string}`;
const NABLA_SWAP_DEADLINE_MINUTES = 60 * 24 * 7;
const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

function buildRecoveredBrlaOutput(brlaReceivedRaw: bigint) {
  const brlaAmountRaw = brlaReceivedRaw.toString();
  const brlaAmountDecimal = multiplyByPowerOfTen(Big(brlaAmountRaw), -18);
  return { brlaAmountDecimal, brlaAmountRaw };
}

async function recoverNablaBrlaOutputFromBalance(
  brlaBalanceBefore: bigint,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<{ brlaAmountRaw: string; brlaAmountDecimal: Big } | null> {
  const brlaBalanceAfter = BigInt(await getBrlaBalanceOnBaseRaw());
  const brlaReceivedRaw = brlaBalanceAfter - brlaBalanceBefore;

  if (brlaReceivedRaw <= 0n) return null;

  const recovered = buildRecoveredBrlaOutput(brlaReceivedRaw);
  state.brlaAmountRaw = recovered.brlaAmountRaw;
  state.brlaAmountDecimal = recovered.brlaAmountDecimal.toString();
  await stateManager.saveState(state);

  console.log(
    `Recovered Nabla BRLA output from Base balance delta: ${recovered.brlaAmountDecimal.toFixed(4)} BRLA ` +
      `(pre: ${brlaBalanceBefore}, post: ${brlaBalanceAfter})`
  );

  return recovered;
}

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

export async function getBrlaBalanceOnPolygonRaw(): Promise<string> {
  const { publicClient, walletClient } = getPolygonEvmClients();
  const balance = await publicClient.readContract({
    abi: erc20Abi,
    address: BRLA_POLYGON,
    args: [walletClient.account.address],
    functionName: "balanceOf"
  });
  return balance.toString();
}

export async function getAveniaBrlaBalanceDecimal(): Promise<string> {
  const brlaApiService = BrlaApiService.getInstance();
  const balanceResponse = await brlaApiService.getMainAccountBalance();
  return String(balanceResponse?.balances?.BRLA ?? "0");
}

async function recoverBrlaTransferToAveniaFromBalance(
  expectedBrlaAmountDecimal: Big,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<boolean> {
  if (!state.aveniaBrlaBalanceBeforeTransfer) return false;

  const currentAveniaBrlaBalance = Big(await getAveniaBrlaBalanceDecimal());
  const receivedDelta = currentAveniaBrlaBalance.minus(Big(state.aveniaBrlaBalanceBeforeTransfer));
  const minimumReceived = calculateMinimumDelta(expectedBrlaAmountDecimal, "0.95");

  if (receivedDelta.lt(minimumReceived)) {
    console.log(
      `Avenia BRLA transfer not recoverable yet. Needed: ${minimumReceived.toFixed(12)}, ` +
        `received: ${receivedDelta.toFixed(12)}.`
    );
    return false;
  }

  state.brlaAmountDecimal = receivedDelta.toString();
  state.brlaAmountRaw = multiplyByPowerOfTen(receivedDelta, 18).toFixed(0, 0);
  await stateManager.saveState(state);

  console.log(
    `Recovered BRLA transfer to Avenia from balance delta: ${receivedDelta.toString()} BRLA ` +
      `(baseline: ${state.aveniaBrlaBalanceBeforeTransfer}, current: ${currentAveniaBrlaBalance.toString()})`
  );
  return true;
}

export async function checkInitialUsdcBalanceOnBase(usdcAmountRaw: string): Promise<Big> {
  const { publicClient, walletClient } = getBaseEvmClients();
  const address = walletClient.account.address;

  const balance = await publicClient.readContract({
    abi: erc20Abi,
    address: USDC_BASE,
    args: [address],
    functionName: "balanceOf"
  });

  const balanceDecimal = multiplyByPowerOfTen(Big(balance.toString()), -6);
  console.log(`Current USDC balance on Base (${address}): ${balanceDecimal.toFixed(6)} USDC`);

  const requiredAmount = multiplyByPowerOfTen(Big(usdcAmountRaw), -6);
  if (balanceDecimal.lt(requiredAmount)) {
    throw new Error(`Insufficient USDC on Base. Have: ${balanceDecimal.toFixed(6)}, need: ${requiredAmount.toFixed(6)}`);
  }

  return balanceDecimal;
}

export async function nablaApproveAndSwapOnBase(
  usdcAmountRaw: string,
  baseNonce: NonceManager,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<{
  brlaAmountRaw: string;
  brlaAmountDecimal: Big;
  approveHash: string | null;
  swapHash: string | null;
}> {
  console.log(`Starting Nabla swap of ${usdcAmountRaw} USDC (raw) to BRLA on Base...`);

  const { walletClient, publicClient } = getBaseEvmClients();
  const executorAddress = walletClient.account.address;

  const { router } = getNablaBasePool(USDC_BASE, ERC20_BRLA_BASE);

  if (state.nablaApproveHash && state.nablaSwapHash && state.brlaAmountRaw && state.brlaAmountDecimal) {
    console.log(`Resuming Nabla swap with previously recorded BRLA output: ${state.brlaAmountDecimal}`);
    return {
      approveHash: state.nablaApproveHash,
      brlaAmountDecimal: Big(state.brlaAmountDecimal),
      brlaAmountRaw: state.brlaAmountRaw,
      swapHash: state.nablaSwapHash
    };
  }

  if (state.nablaSwapHash && !state.brlaBalanceBeforeNablaRaw) {
    throw new Error("State corrupted: missing pre-Nabla BRLA balance baseline for completed swap.");
  }

  if (!state.brlaBalanceBeforeNablaRaw) {
    state.brlaBalanceBeforeNablaRaw = await getBrlaBalanceOnBaseRaw();
    await stateManager.saveState(state);
  }

  const brlaBalanceBefore = BigInt(state.brlaBalanceBeforeNablaRaw);

  const recoveredBeforeSend = await recoverNablaBrlaOutputFromBalance(brlaBalanceBefore, state, stateManager);
  if (recoveredBeforeSend) {
    console.log("Existing BRLA balance delta detected before sending a new Nabla swap. Continuing recovered rebalance.");
    return {
      approveHash: state.nablaApproveHash,
      brlaAmountDecimal: recoveredBeforeSend.brlaAmountDecimal,
      brlaAmountRaw: recoveredBeforeSend.brlaAmountRaw,
      swapHash: state.nablaSwapHash
    };
  }

  let approveHash = state.nablaApproveHash;
  let swapHash = state.nablaSwapHash;

  if (!swapHash) {
    const evmClientManager = EvmClientManager.getInstance();
    const quoteAbi = [
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

    const { quoter } = getNablaBasePool(USDC_BASE, ERC20_BRLA_BASE);
    const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
      abi: quoteAbi,
      address: quoter,
      args: [BigInt(usdcAmountRaw), [USDC_BASE, ERC20_BRLA_BASE], [router]],
      functionName: "quoteSwapExactTokensForTokens"
    });

    const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -18);
    console.log(`Expected BRLA output: ${expectedOutputDecimal.toFixed(4)}`);

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
      console.log("Sending Nabla approve transaction on Base...");
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
      console.log(`Resuming Nabla approval with existing tx: ${approveHash}`);
    }

    await waitForTransactionConfirmation(approveHash, publicClient);
    console.log("Nabla approval confirmed.");

    console.log("Sending Nabla swap transaction on Base...");
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
    console.log(`Resuming Nabla swap with existing approve tx: ${approveHash}, swap tx: ${swapHash}`);
  }

  if (!approveHash || !swapHash) {
    throw new Error("State corrupted: Nabla transaction hash missing after swap step.");
  }

  try {
    await waitForTransactionConfirmation(swapHash, publicClient);
    console.log("Nabla swap confirmed.");
  } catch (error) {
    const recovered = await recoverNablaBrlaOutputFromBalance(brlaBalanceBefore, state, stateManager);
    if (recovered) {
      console.warn(`Nabla swap confirmation failed, but BRLA balance delta proves completion. Continuing. ${error}`);
      return {
        approveHash,
        brlaAmountDecimal: recovered.brlaAmountDecimal,
        brlaAmountRaw: recovered.brlaAmountRaw,
        swapHash
      };
    }

    throw error;
  }

  // Delay to let the RPC sync the post-swap state before reading the balance
  await new Promise(resolve => setTimeout(resolve, 5_000));

  const brlaBalanceAfter = await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_BRLA_BASE,
    args: [executorAddress],
    functionName: "balanceOf"
  });

  const brlaReceivedRaw = brlaBalanceAfter - brlaBalanceBefore;
  if (brlaReceivedRaw < 0n) {
    throw new Error(
      `BRLA balance decreased after swap (pre: ${brlaBalanceBefore}, post: ${brlaBalanceAfter}). Possible external interference.`
    );
  }
  if (brlaReceivedRaw === 0n) {
    throw new Error(`No BRLA balance delta detected after Nabla swap (pre: ${brlaBalanceBefore}, post: ${brlaBalanceAfter}).`);
  }
  const { brlaAmountRaw, brlaAmountDecimal } = buildRecoveredBrlaOutput(brlaReceivedRaw);
  console.log(`Received ${brlaAmountDecimal.toFixed(4)} BRLA on Base (pre: ${brlaBalanceBefore}, post: ${brlaBalanceAfter})`);

  return {
    approveHash,
    brlaAmountDecimal,
    brlaAmountRaw,
    swapHash
  };
}

export async function transferBrlaToAveniaOnBase(
  brlaAmountRaw: string,
  baseNonce: NonceManager,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<string | null> {
  const { brlaBusinessAccountAddress } = getConfig();
  const { walletClient, publicClient } = getBaseEvmClients();
  const brlaAmountDecimal = multiplyByPowerOfTen(Big(brlaAmountRaw), -18);

  if (await recoverBrlaTransferToAveniaFromBalance(brlaAmountDecimal, state, stateManager)) {
    console.log("Existing Avenia BRLA balance delta detected before sending a new transfer. Continuing recovered rebalance.");
    return state.brlaTransferHash;
  }

  if (state.brlaTransferHash) {
    console.log(`Resuming BRLA transfer with existing tx: ${state.brlaTransferHash}. Verifying on-chain...`);
    try {
      await waitForTransactionConfirmation(state.brlaTransferHash, publicClient);
    } catch (error) {
      if (await recoverBrlaTransferToAveniaFromBalance(brlaAmountDecimal, state, stateManager)) {
        console.warn(`BRLA transfer confirmation failed, but Avenia balance delta proves completion. Continuing. ${error}`);
        return state.brlaTransferHash;
      }

      throw error;
    }
    return state.brlaTransferHash;
  }

  console.log(`Transferring ${brlaAmountRaw} BRLA (raw) to Avenia account ${brlaBusinessAccountAddress} on Base...`);

  const data = encodeFunctionData({
    abi: erc20Abi,
    args: [brlaBusinessAccountAddress as `0x${string}`, BigInt(brlaAmountRaw)],
    functionName: "transfer"
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  const txHash = await walletClient.sendTransaction({
    account: walletClient.account,
    chain: base,
    data,
    gas: 100000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: baseNonce.next(),
    to: ERC20_BRLA_BASE,
    value: 0n
  });

  state.brlaTransferHash = txHash;
  await stateManager.saveState(state);
  console.log(`BRLA transfer tx sent: ${txHash}`);
  try {
    await waitForTransactionConfirmation(txHash, publicClient);
  } catch (error) {
    if (await recoverBrlaTransferToAveniaFromBalance(brlaAmountDecimal, state, stateManager)) {
      console.warn(`BRLA transfer confirmation failed, but Avenia balance delta proves completion. Continuing. ${error}`);
      return txHash;
    }

    throw error;
  }
  console.log("BRLA transfer to Avenia confirmed on Base.");

  return txHash;
}

export async function waitForBrlaOnAvenia(brlaAmountDecimal: Big, startingBrlaBalanceDecimal: Big): Promise<string> {
  const pollInterval = 5000;
  const timeout = 10 * 60 * 1000;
  const startTime = Date.now();
  const brlaApiService = BrlaApiService.getInstance();
  // Use generous tolerance (95%) — continue with whatever actually arrives after fees.
  const minimumReceived = calculateMinimumDelta(brlaAmountDecimal, "0.95");

  console.log(`Waiting for ~${brlaAmountDecimal.toFixed(4)} BRLA delta to appear on Avenia main account balance...`);

  while (Date.now() - startTime < timeout) {
    try {
      const balanceResponse = await brlaApiService.getMainAccountBalance();
      if (balanceResponse && balanceResponse.balances && balanceResponse.balances.BRLA !== undefined) {
        const balanceDecimal = Big(balanceResponse.balances.BRLA);
        const receivedDelta = balanceDecimal.minus(startingBrlaBalanceDecimal);
        if (receivedDelta.gte(minimumReceived)) {
          console.log(`Sufficient BRLA delta found on Avenia: ${receivedDelta.toString()}`);
          return receivedDelta.toString();
        }
        console.log(
          `Insufficient BRLA delta. Needed: ${minimumReceived.toFixed(12)}, received: ${receivedDelta.toFixed(12)}. Retrying...`
        );
      }
    } catch (error) {
      console.log("Polling for Avenia balance failed with error. Retrying...", error);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Avenia BRLA balance check timed out after 10 minutes. Needed ~${brlaAmountDecimal.toFixed(4)} BRLA.`);
}

export async function fetchSquidRouterQuote(brlaAmountDecimal: Big): Promise<string> {
  const { walletClient: baseWalletClient } = getBaseEvmClients();
  const baseAddress = baseWalletClient.account.address;
  const { walletClient: polygonWalletClient } = getPolygonEvmClients();
  const polygonAddress = polygonWalletClient.account.address;
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmountDecimal, 18).toFixed(0, 0);

  const routeResult = await getRoute(
    {
      bypassGuardrails: true,
      enableExpress: true,
      fromAddress: polygonAddress,
      fromAmount: brlaAmountRaw,
      fromChain: getNetworkId(Networks.Polygon).toString(),
      fromToken: BRLA_POLYGON,
      slippage: 4,
      toAddress: baseAddress,
      toChain: getNetworkId(Networks.Base).toString(),
      toToken: USDC_BASE
    },
    { useCache: true }
  );

  const quoteUsdc = routeResult.data.route.estimate.toAmount;
  console.log(`SquidRouter quote: ${quoteUsdc} USDC (raw, 6 decimals)`);
  return quoteUsdc;
}

export async function fetchAveniaQuote(brlaAmountDecimal: Big): Promise<string> {
  const brlaApiService = BrlaApiService.getInstance();
  const aveniaQuote = await brlaApiService.createOnchainSwapQuote(
    {
      inputAmount: brlaAmountDecimal.toFixed(4, 0),
      inputCurrency: BrlaCurrency.BRLA,
      outputCurrency: BrlaCurrency.USDC,
      outputPaymentMethod: AveniaPaymentMethod.BASE
    },
    { useCache: true }
  );

  // Avenia API returns outputAmount in decimal units. Convert to raw USDC (6 decimals).
  const outputUsdcRaw = multiplyByPowerOfTen(Big(aveniaQuote.outputAmount), 6).toFixed(0, 0);
  console.log(`Avenia quote: ${outputUsdcRaw} USDC (raw, 6 decimals)`);
  return outputUsdcRaw;
}

export async function compareRates(brlaAmountDecimal: Big): Promise<{
  winningRoute: "squidrouter" | "avenia";
  squidRouterQuoteUsdc: string | null;
  aveniaQuoteUsdc: string | null;
}> {
  console.log("Comparing SquidRouter vs Avenia rates for BRLA -> USDC...");

  let squidRouterQuoteUsdc: string | null = null;
  let aveniaQuoteUsdc: string | null = null;

  try {
    squidRouterQuoteUsdc = await fetchSquidRouterQuote(brlaAmountDecimal);
  } catch (error) {
    console.warn("SquidRouter quote failed:", error);
  }

  try {
    aveniaQuoteUsdc = await fetchAveniaQuote(brlaAmountDecimal);
  } catch (error) {
    console.warn("Avenia quote failed:", error);
  }

  if (!squidRouterQuoteUsdc && !aveniaQuoteUsdc) {
    throw new Error("Both SquidRouter and Avenia quotes failed. Cannot proceed.");
  }

  if (!squidRouterQuoteUsdc) {
    console.log("SquidRouter unavailable, using Avenia.");
    return { aveniaQuoteUsdc, squidRouterQuoteUsdc, winningRoute: "avenia" };
  }

  if (!aveniaQuoteUsdc) {
    console.log("Avenia unavailable, using SquidRouter.");
    return { aveniaQuoteUsdc, squidRouterQuoteUsdc, winningRoute: "squidrouter" };
  }

  const squidUsdcDecimal = multiplyByPowerOfTen(Big(squidRouterQuoteUsdc), -6);
  const aveniaUsdcDecimal = multiplyByPowerOfTen(Big(aveniaQuoteUsdc), -6);

  console.log(`SquidRouter: ${squidUsdcDecimal.toFixed(6)} USDC | Avenia: ${aveniaUsdcDecimal.toFixed(6)} USDC`);

  const winningRoute = squidUsdcDecimal.gt(aveniaUsdcDecimal) ? "squidrouter" : "avenia";
  console.log(`Winner: ${winningRoute}`);

  return { aveniaQuoteUsdc, squidRouterQuoteUsdc, winningRoute };
}

export async function aveniaTransferBrlaToPolygon(brlaAmountDecimal: Big): Promise<string> {
  console.log(`Requesting Avenia to transfer ${brlaAmountDecimal.toFixed(4)} BRLA from internal balance to Polygon...`);

  const brlaApiService = BrlaApiService.getInstance();

  const quote = await brlaApiService.createOnchainSwapQuote({
    inputAmount: brlaAmountDecimal.toFixed(4, 0),
    inputCurrency: BrlaCurrency.BRLA,
    outputCurrency: BrlaCurrency.BRLA,
    outputPaymentMethod: AveniaPaymentMethod.POLYGON
  });

  const { walletClient: polygonWalletClient } = getPolygonEvmClients();
  const polygonAddress = polygonWalletClient.account.address;

  const ticket = await brlaApiService.createOnchainSwapTicket({
    quoteToken: quote.quoteToken,
    ticketBlockchainOutput: {
      walletAddress: polygonAddress,
      walletChain: AveniaPaymentMethod.POLYGON
    }
  });
  console.log(`Avenia transfer ticket created: ${ticket.id}`);
  return ticket.id;
}

export async function waitBrlaOnPolygon(brlaAmountRaw: string, startingBrlaBalanceRaw: string): Promise<string> {
  const { walletClient: polygonWalletClient } = getPolygonEvmClients();
  const polygonAddress = polygonWalletClient.account.address;
  // Use a generous tolerance (95%) — we continue with whatever actually arrives.
  const targetBalanceRaw = calculateTargetBalanceRaw(startingBrlaBalanceRaw, brlaAmountRaw, "0.95");

  console.log(`Waiting for BRLA delta to arrive on Polygon (${polygonAddress})...`);

  const finalBalance = await checkEvmBalancePeriodically(
    BRLA_POLYGON,
    polygonAddress,
    targetBalanceRaw,
    1_000,
    10 * 60 * 1_000,
    Networks.Polygon
  );

  const arrivedRaw = finalBalance.minus(Big(startingBrlaBalanceRaw)).toFixed(0, 0);
  console.log(`BRLA arrived on Polygon. Actual delta: ${arrivedRaw} raw`);
  return arrivedRaw;
}

export async function resetFailedSquidRouterSwapOnResume(
  swapHash: string,
  state: UsdcBaseRebalanceState,
  stateManager: Pick<UsdcBaseStateManager, "saveState">,
  polygonPublicClient: PublicClient
): Promise<boolean> {
  const receipt = await polygonPublicClient.waitForTransactionReceipt({
    confirmations: 1,
    hash: swapHash as `0x${string}`
  });

  if (receipt.status === "success") return false;

  console.warn(`Persisted SquidRouter swap tx ${swapHash} failed on Polygon. Retrying with a fresh route.`);
  state.squidRouterSwapHash = null;
  state.squidRouterQuoteUsdc = null;
  await stateManager.saveState(state);
  return true;
}

export async function recoverSquidUsdcOutputFromBaseBalance(
  expectedUsdcRaw: string | null,
  startingUsdcBalanceRaw: string | null,
  state: UsdcBaseRebalanceState,
  stateManager: Pick<UsdcBaseStateManager, "saveState">,
  getCurrentBaseUsdcRaw = getUsdcBalanceOnBaseRaw
): Promise<string | null> {
  if (!expectedUsdcRaw || !startingUsdcBalanceRaw) return null;

  const currentBaseUsdcRaw = Big(await getCurrentBaseUsdcRaw());
  const receivedDeltaRaw = currentBaseUsdcRaw.minus(Big(startingUsdcBalanceRaw));
  const minimumReceivedRaw = calculateMinimumDelta(Big(expectedUsdcRaw), DEFAULT_ARRIVAL_TOLERANCE);

  if (receivedDeltaRaw.lt(minimumReceivedRaw)) return null;

  const recoveredUsdcRaw = receivedDeltaRaw.toFixed(0, 0);
  state.squidRouterQuoteUsdc = recoveredUsdcRaw;
  await stateManager.saveState(state);
  console.log(
    `Recovered SquidRouter Base USDC output from balance delta: ${multiplyByPowerOfTen(Big(recoveredUsdcRaw), -6).toFixed(6)} USDC ` +
      `(pre: ${startingUsdcBalanceRaw}, post: ${currentBaseUsdcRaw.toFixed(0, 0)})`
  );

  return recoveredUsdcRaw;
}

export function ensurePolygonBrlaAvailableForSquidSwap(availableBrlaRaw: string, requiredBrlaRaw: string): void {
  if (Big(availableBrlaRaw).gte(Big(requiredBrlaRaw))) return;

  throw new Error(
    `Insufficient Polygon BRLA for SquidRouter swap: required ${requiredBrlaRaw} raw, available ${availableBrlaRaw} raw.`
  );
}

export async function squidRouterApproveAndSwap(
  brlaAmountRaw: string,
  baseReceiverAddress: `0x${string}`,
  polygonNonce: NonceManager,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<{ swapHash: string | null; toAmountUsd: string; toAmountRaw: string }> {
  let swapHash = state.squidRouterSwapHash;
  let toAmountUsd = "0";
  let toAmountRaw = state.squidRouterQuoteUsdc ?? "0";

  if (swapHash) {
    const { publicClient: polygonPublicClient } = getPolygonEvmClients();

    const recoveredUsdcRaw = await recoverSquidUsdcOutputFromBaseBalance(
      state.squidRouterQuoteUsdc,
      state.baseUsdcBalanceBeforeSquidSwapRaw,
      state,
      stateManager
    );
    if (recoveredUsdcRaw) return { swapHash, toAmountRaw: recoveredUsdcRaw, toAmountUsd };

    if (await resetFailedSquidRouterSwapOnResume(swapHash, state, stateManager, polygonPublicClient)) {
      swapHash = null;
      toAmountRaw = "0";
    }
  }

  if (!swapHash) {
    console.log("Executing SquidRouter swap: Polygon BRLA -> Base USDC...");

    const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();
    const polygonAddress = polygonWalletClient.account.address;

    const recoveredUsdcRaw = await recoverSquidUsdcOutputFromBaseBalance(
      state.squidRouterQuoteUsdc,
      state.baseUsdcBalanceBeforeSquidSwapRaw,
      state,
      stateManager
    );
    if (recoveredUsdcRaw) return { swapHash, toAmountRaw: recoveredUsdcRaw, toAmountUsd };

    ensurePolygonBrlaAvailableForSquidSwap(await getBrlaBalanceOnPolygonRaw(), brlaAmountRaw);

    const routeResult = await getRoute({
      bypassGuardrails: true,
      enableExpress: true,
      fromAddress: polygonAddress,
      fromAmount: brlaAmountRaw,
      fromChain: getNetworkId(Networks.Polygon).toString(),
      fromToken: BRLA_POLYGON,
      slippage: 4,
      toAddress: baseReceiverAddress,
      toChain: getNetworkId(Networks.Base).toString(),
      toToken: USDC_BASE
    });

    const route = routeResult.data.route;
    toAmountUsd = route.estimate.toAmountUSD;
    toAmountRaw = route.estimate.toAmount;
    state.squidRouterQuoteUsdc = toAmountRaw;
    await stateManager.saveState(state);
    console.log(`SquidRouter route obtained. Expected output: ${toAmountRaw} USDC (raw)`);

    const { approveData, swapData } = await createTransactionDataFromRoute({
      inputTokenErc20Address: BRLA_POLYGON,
      publicClient: polygonPublicClient,
      rawAmount: brlaAmountRaw,
      route
    });

    console.log("Sending SquidRouter approve transaction on Polygon...");
    const { maxFeePerGas: approveFee, maxPriorityFeePerGas: approveTip } = await polygonPublicClient.estimateFeesPerGas();
    const approveHash = await polygonWalletClient.sendTransaction({
      account: polygonWalletClient.account,
      chain: polygon,
      data: approveData.data,
      gas: BigInt(approveData.gas),
      maxFeePerGas: approveFee * 5n,
      maxPriorityFeePerGas: approveTip * 5n,
      nonce: polygonNonce.next(),
      to: approveData.to,
      value: BigInt(approveData.value)
    });
    console.log(`Approve tx: ${approveHash}`);
    await waitForTransactionConfirmation(approveHash, polygonPublicClient);

    console.log("Sending SquidRouter swap transaction on Polygon...");
    const { maxFeePerGas: swapFee, maxPriorityFeePerGas: swapTip } = await polygonPublicClient.estimateFeesPerGas();
    swapHash = await polygonWalletClient.sendTransaction({
      account: polygonWalletClient.account,
      chain: polygon,
      data: swapData.data,
      gas: BigInt(swapData.gas),
      maxFeePerGas: swapFee * 5n,
      maxPriorityFeePerGas: swapTip * 5n,
      nonce: polygonNonce.next(),
      to: swapData.to,
      value: BigInt(swapData.value)
    });
    state.squidRouterSwapHash = swapHash;
    await stateManager.saveState(state);
    console.log(`Swap tx: ${swapHash}`);
    await waitForTransactionConfirmation(swapHash, polygonPublicClient);
  } else {
    if (!state.squidRouterQuoteUsdc) {
      throw new Error("State corrupted: squidRouterQuoteUsdc missing while resuming SquidRouter swap.");
    }
    console.log(`Resuming SquidRouter swap with existing swap tx: ${swapHash}`);
  }

  console.log("Waiting for Axelar to execute the cross-chain swap...");
  let isExecuted = false;
  const axelarTimeout = 30 * 60 * 1000;
  const axelarStartTime = Date.now();

  while (Date.now() - axelarStartTime < axelarTimeout) {
    const axelarScanStatus = await getStatusAxelarScan(swapHash);
    if (axelarScanStatus && (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed")) {
      isExecuted = true;
      console.log(`Axelar execution confirmed: ${axelarScanStatus.status}`);
      break;
    }
    console.log("Waiting for Axelar execution...");
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  if (!isExecuted) {
    throw new Error("Axelar execution timed out after 30 minutes");
  }

  return { swapHash, toAmountRaw, toAmountUsd };
}

export async function waitUsdcOnBase(expectedUsdcRaw: string, startingUsdcBalanceRaw: string): Promise<string> {
  const { walletClient } = getBaseEvmClients();
  const baseAddress = walletClient.account.address;
  const targetBalanceRaw = calculateTargetBalanceRaw(startingUsdcBalanceRaw, expectedUsdcRaw, DEFAULT_ARRIVAL_TOLERANCE);

  console.log(`Waiting for USDC delta to arrive on Base (${baseAddress})...`);

  const finalBalanceRaw = await checkEvmBalancePeriodically(
    USDC_BASE,
    baseAddress,
    targetBalanceRaw,
    1_000,
    30 * 60 * 1_000,
    Networks.Base
  );
  const receivedDeltaRaw = finalBalanceRaw.minus(Big(startingUsdcBalanceRaw)).toFixed(0, 0);

  console.log(`USDC arrived on Base. Actual delta: ${receivedDeltaRaw} raw`);
  return receivedDeltaRaw;
}

export async function aveniaCreateSwapToUsdcBaseTicket(
  brlaAmountDecimal: Big,
  baseReceiverAddress: `0x${string}`
): Promise<{
  ticketId: string;
  outputAmount: string;
}> {
  console.log(`Creating Avenia swap ticket: BRLA -> USDC on Base for ${brlaAmountDecimal.toFixed(4)} BRLA...`);

  const brlaApiService = BrlaApiService.getInstance();

  const quote = await brlaApiService.createOnchainSwapQuote({
    inputAmount: brlaAmountDecimal.toFixed(4, 0),
    inputCurrency: BrlaCurrency.BRLA,
    outputCurrency: BrlaCurrency.USDC,
    outputPaymentMethod: AveniaPaymentMethod.BASE
  });

  const ticket = await brlaApiService.createOnchainSwapTicket({
    quoteToken: quote.quoteToken,
    ticketBlockchainOutput: {
      walletAddress: baseReceiverAddress,
      walletChain: AveniaPaymentMethod.BASE
    }
  });
  console.log(`Avenia swap ticket created: ${ticket.id}`);

  // Avenia API returns outputAmount in decimal units.
  return { outputAmount: quote.outputAmount, ticketId: ticket.id };
}

export async function verifyFinalUsdcBalanceOnBase(): Promise<Big> {
  const { publicClient, walletClient } = getBaseEvmClients();
  const address = walletClient.account.address;

  const balance = await publicClient.readContract({
    abi: erc20Abi,
    address: USDC_BASE,
    args: [address],
    functionName: "balanceOf"
  });

  const balanceDecimal = multiplyByPowerOfTen(Big(balance.toString()), -6);
  console.log(`Final USDC balance on Base (${address}): ${balanceDecimal.toFixed(6)} USDC`);

  return balanceDecimal;
}

// ── Main Nabla route (BRL → USDC on a second Nabla instance on Base) ─────────

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
    brlaToken: ERC20_BRLA_BASE,
    quoter: config.mainNablaQuoter,
    router: config.mainNablaRouter,
    usdcToken: USDC_BASE
  };
}

/**
 * Fetches a quote from the main Nabla instance for BRL→USDC.
 * Returns the expected USDC output in raw units (6 decimals assumed for USDC).
 */
export async function fetchMainNablaQuote(brlaAmountRaw: string): Promise<string> {
  const { router, quoter, brlaToken, usdcToken } = getMainNablaConfig();
  const evmClientManager = EvmClientManager.getInstance();

  const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
    abi: MAIN_NABLA_QUOTE_ABI,
    address: quoter,
    args: [BigInt(brlaAmountRaw), [brlaToken, usdcToken], [router]],
    functionName: "quoteSwapExactTokensForTokens"
  });

  const expectedOutputDecimal = multiplyByPowerOfTen(Big(expectedOutputRaw.toString()), -6);
  console.log(`Main Nabla quote: ${expectedOutputDecimal.toFixed(6)} USDC`);
  return expectedOutputRaw.toString();
}

/**
 * Quotes the first Nabla swap (USDC→BRLA) to estimate how much BRLA we'd get,
 * then quotes all 3 return routes to compare them upfront.
 */
export async function compareRoutesUpfront(usdcAmountRaw: string): Promise<{
  winningRoute: WinningRoute;
  estimatedBrlaRaw: string;
  squidRouterQuoteUsdc: string | null;
  aveniaQuoteUsdc: string | null;
  mainNablaQuoteUsdc: string | null;
}> {
  console.log("Quoting first Nabla (USDC→BRLA) to estimate BRLA output for route comparison...");

  const evmClientManager = EvmClientManager.getInstance();
  const quoteAbi = [
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

  const { router, quoter } = getNablaBasePool(USDC_BASE, ERC20_BRLA_BASE);
  const estimatedBrlaRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
    abi: quoteAbi,
    address: quoter,
    args: [BigInt(usdcAmountRaw), [USDC_BASE, ERC20_BRLA_BASE], [router]],
    functionName: "quoteSwapExactTokensForTokens"
  });

  const estimatedBrlaDecimal = multiplyByPowerOfTen(Big(estimatedBrlaRaw.toString()), -18);
  console.log(`Estimated BRLA from first Nabla: ${estimatedBrlaDecimal.toFixed(6)}`);

  // Quote all 3 return routes in parallel
  let squidRouterQuoteUsdc: string | null = null;
  let aveniaQuoteUsdc: string | null = null;
  let mainNablaQuoteUsdc: string | null = null;

  const config = getConfig();
  const mainNablaAvailable = !!(config.mainNablaRouter && config.mainNablaQuoter);

  const results = await Promise.allSettled([
    fetchSquidRouterQuote(estimatedBrlaDecimal),
    fetchAveniaQuote(estimatedBrlaDecimal),
    mainNablaAvailable ? fetchMainNablaQuote(estimatedBrlaRaw.toString()) : Promise.reject("not configured")
  ]);

  if (results[0].status === "fulfilled") {
    squidRouterQuoteUsdc = results[0].value;
  } else {
    console.warn("SquidRouter quote failed:", results[0].reason);
  }

  if (results[1].status === "fulfilled") {
    aveniaQuoteUsdc = results[1].value;
  } else {
    console.warn("Avenia quote failed:", results[1].reason);
  }

  if (results[2].status === "fulfilled") {
    mainNablaQuoteUsdc = results[2].value;
  } else if (mainNablaAvailable) {
    console.warn("Main Nabla quote failed:", results[2].reason);
  }

  // Normalize all quotes to decimal USDC for comparison
  const candidates: { route: WinningRoute; usdcDecimal: Big }[] = [];

  if (squidRouterQuoteUsdc) {
    candidates.push({ route: "squidrouter", usdcDecimal: multiplyByPowerOfTen(Big(squidRouterQuoteUsdc), -6) });
  }
  if (aveniaQuoteUsdc) {
    candidates.push({ route: "avenia", usdcDecimal: multiplyByPowerOfTen(Big(aveniaQuoteUsdc), -6) });
  }
  if (mainNablaQuoteUsdc) {
    candidates.push({ route: "nabla-main", usdcDecimal: multiplyByPowerOfTen(Big(mainNablaQuoteUsdc), -6) });
  }

  if (candidates.length === 0) {
    throw new Error("All route quotes failed. Cannot proceed.");
  }

  candidates.sort((a, b) => (b.usdcDecimal.gt(a.usdcDecimal) ? 1 : -1));
  const winner = candidates[0] as (typeof candidates)[number];

  console.log("Route comparison results:");
  for (const c of candidates) {
    console.log(`  ${c.route}: ${c.usdcDecimal.toFixed(6)} USDC ${c.route === winner.route ? "(WINNER)" : ""}`);
  }

  return {
    aveniaQuoteUsdc,
    estimatedBrlaRaw: estimatedBrlaRaw.toString(),
    mainNablaQuoteUsdc,
    squidRouterQuoteUsdc,
    winningRoute: winner.route
  };
}

/**
 * Approve and swap BRL→USDC on the main Nabla instance on Base.
 * This is the terminal step for the nabla-main route.
 */
export async function mainNablaApproveAndSwap(
  brlaAmountRaw: string,
  baseNonce: NonceManager,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<{ approveHash: string; swapHash: string; usdcReceivedRaw: string }> {
  const { router, brlaToken, usdcToken } = getMainNablaConfig();
  const { walletClient, publicClient } = getBaseEvmClients();
  const executorAddress = walletClient.account.address;

  console.log(`Starting Main Nabla swap of ${brlaAmountRaw} BRLA (raw) to USDC on Base...`);

  if (state.mainNablaApproveHash && state.mainNablaSwapHash) {
    console.log("Resuming Main Nabla swap with previously recorded hashes.");
  }

  if (!state.mainNablaUsdcBalanceBeforeRaw) {
    state.mainNablaUsdcBalanceBeforeRaw = await getUsdcBalanceOnBaseRaw();
    await stateManager.saveState(state);
  }
  const usdcBalanceBefore = BigInt(state.mainNablaUsdcBalanceBeforeRaw);

  let approveHash = state.mainNablaApproveHash;
  let swapHash = state.mainNablaSwapHash;

  if (!swapHash) {
    const evmClientManager = EvmClientManager.getInstance();
    const { quoter } = getMainNablaConfig();
    const expectedOutputRaw = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
      abi: MAIN_NABLA_QUOTE_ABI,
      address: quoter,
      args: [BigInt(brlaAmountRaw), [brlaToken, usdcToken], [router]],
      functionName: "quoteSwapExactTokensForTokens"
    });

    const nablaHardMinimumOutputRaw = Big(expectedOutputRaw.toString())
      .mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN)
      .toFixed(0, 0);

    const { approve, swap } = await createNablaTransactionsForOnrampOnEVM(
      brlaAmountRaw,
      { address: executorAddress, type: EphemeralAccountType.EVM },
      brlaToken,
      usdcToken,
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

  // Delay to let the RPC sync post-swap state
  await new Promise(resolve => setTimeout(resolve, 5_000));

  const usdcBalanceAfter = await publicClient.readContract({
    abi: erc20Abi,
    address: USDC_BASE,
    args: [executorAddress],
    functionName: "balanceOf"
  });

  const usdcReceivedRaw = (usdcBalanceAfter - usdcBalanceBefore).toString();
  const usdcReceivedDecimal = multiplyByPowerOfTen(Big(usdcReceivedRaw), -6);
  console.log(`Received ${usdcReceivedDecimal.toFixed(6)} USDC from Main Nabla swap.`);

  return { approveHash, swapHash, usdcReceivedRaw };
}
