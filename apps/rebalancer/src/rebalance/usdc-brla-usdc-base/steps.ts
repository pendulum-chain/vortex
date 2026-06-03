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
import { encodeFunctionData, erc20Abi } from "viem";
import { base, polygon } from "viem/chains";
import { UsdcBaseRebalanceState, UsdcBaseStateManager } from "../../services/stateManager.ts";
import { getBaseEvmClients, getConfig, getPolygonEvmClients } from "../../utils/config.ts";
import { NonceManager } from "../../utils/nonce.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";
import { calculateMinimumDelta, calculateTargetBalanceRaw, DEFAULT_ARRIVAL_TOLERANCE } from "./guards.ts";

export const USDC_BASE: `0x${string}` = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BRLA_POLYGON: `0x${string}` = "0xe6a537a407488807f0bbeb0038b79004f19dddfb";
const NABLA_SWAP_DEADLINE_MINUTES = 60 * 24 * 7;
const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

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
  approveHash: string;
  swapHash: string;
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

  await waitForTransactionConfirmation(swapHash, publicClient);
  console.log("Nabla swap confirmed.");

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
  const brlaAmountRaw = brlaReceivedRaw.toString();
  const brlaAmountDecimal = multiplyByPowerOfTen(Big(brlaAmountRaw), -18);
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
): Promise<string> {
  const { brlaBusinessAccountAddress } = getConfig();
  const { walletClient, publicClient } = getBaseEvmClients();

  if (state.brlaTransferHash) {
    console.log(`Resuming BRLA transfer with existing tx: ${state.brlaTransferHash}. Verifying on-chain...`);
    await waitForTransactionConfirmation(state.brlaTransferHash, publicClient);
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
  await waitForTransactionConfirmation(txHash, publicClient);
  console.log("BRLA transfer to Avenia confirmed on Base.");

  return txHash;
}

export async function waitForBrlaOnAvenia(brlaAmountDecimal: Big, startingBrlaBalanceDecimal: Big): Promise<string> {
  const pollInterval = 5000;
  const timeout = 10 * 60 * 1000;
  const startTime = Date.now();
  const brlaApiService = BrlaApiService.getInstance();
  const minimumReceived = calculateMinimumDelta(brlaAmountDecimal);

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
      inputAmount: brlaAmountDecimal.toFixed(12, 0),
      inputCurrency: BrlaCurrency.BRLA,
      outputCurrency: BrlaCurrency.USDC,
      outputPaymentMethod: AveniaPaymentMethod.BASE
    },
    { useCache: true }
  );

  console.log(`Avenia quote: ${aveniaQuote.outputAmount} USDC`);
  return aveniaQuote.outputAmount;
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
  const aveniaUsdcDecimal = Big(aveniaQuoteUsdc);

  console.log(`SquidRouter: ${squidUsdcDecimal.toFixed(6)} USDC | Avenia: ${aveniaUsdcDecimal.toFixed(6)} USDC`);

  const winningRoute = squidUsdcDecimal.gt(aveniaUsdcDecimal) ? "squidrouter" : "avenia";
  console.log(`Winner: ${winningRoute}`);

  return { aveniaQuoteUsdc, squidRouterQuoteUsdc, winningRoute };
}

export async function aveniaTransferBrlaToPolygon(brlaAmountDecimal: Big): Promise<string> {
  console.log(`Requesting Avenia to transfer ${brlaAmountDecimal.toFixed(4)} BRLA from internal balance to Polygon...`);

  const brlaApiService = BrlaApiService.getInstance();

  const quote = await brlaApiService.createOnchainSwapQuote({
    inputAmount: brlaAmountDecimal.toFixed(12, 0),
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

export async function waitBrlaOnPolygon(brlaAmountRaw: string, startingBrlaBalanceRaw: string): Promise<void> {
  const { walletClient: polygonWalletClient } = getPolygonEvmClients();
  const polygonAddress = polygonWalletClient.account.address;
  const targetBalanceRaw = calculateTargetBalanceRaw(startingBrlaBalanceRaw, brlaAmountRaw, DEFAULT_ARRIVAL_TOLERANCE);

  console.log(`Waiting for BRLA delta to arrive on Polygon (${polygonAddress})...`);

  await checkEvmBalancePeriodically(BRLA_POLYGON, polygonAddress, targetBalanceRaw, 1_000, 10 * 60 * 1_000, Networks.Polygon);

  console.log("BRLA arrived on Polygon.");
}

export async function squidRouterApproveAndSwap(
  brlaAmountRaw: string,
  baseReceiverAddress: `0x${string}`,
  polygonNonce: NonceManager,
  state: UsdcBaseRebalanceState,
  stateManager: UsdcBaseStateManager
): Promise<{ swapHash: string; toAmountUsd: string }> {
  let swapHash = state.squidRouterSwapHash;
  let toAmountUsd = "0";

  if (!swapHash) {
    console.log("Executing SquidRouter swap: Polygon BRLA -> Base USDC...");

    const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();
    const polygonAddress = polygonWalletClient.account.address;

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
    console.log(`SquidRouter route obtained. Expected output: ${route.estimate.toAmount} USDC (raw)`);

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

  return { swapHash, toAmountUsd };
}

export async function waitUsdcOnBase(expectedUsdcRaw: string, startingUsdcBalanceRaw: string): Promise<void> {
  const { walletClient } = getBaseEvmClients();
  const baseAddress = walletClient.account.address;
  const targetBalanceRaw = calculateTargetBalanceRaw(startingUsdcBalanceRaw, expectedUsdcRaw);

  console.log(`Waiting for USDC delta to arrive on Base (${baseAddress})...`);

  await checkEvmBalancePeriodically(USDC_BASE, baseAddress, targetBalanceRaw, 1_000, 30 * 60 * 1_000, Networks.Base);

  console.log("USDC arrived on Base.");
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
    inputAmount: brlaAmountDecimal.toFixed(12, 0),
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
