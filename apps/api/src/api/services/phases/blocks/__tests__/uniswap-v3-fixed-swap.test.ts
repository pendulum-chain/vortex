import { afterAll, describe, expect, it, mock } from "bun:test";
import { EphemeralAccountType, type EvmTransactionData, EvmToken, Networks, type PresignedTx } from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import * as financialOperationNamespace from "../core/financial-operation";
import { allocateNonces } from "../core/prepare";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_FEE,
  POLYGON_EURE_USDC_POOL,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC,
  uniswapV3RouterAbi
} from "../phases/uniswap-v3-fixed-swap/contract";
import { simulateUniswapV3FixedSwap } from "../phases/uniswap-v3-fixed-swap/simulation";
import {
  prepareUniswapV3FixedSwapTxs,
  type UniswapV3FixedSwapPreparation
} from "../phases/uniswap-v3-fixed-swap/transactions";
import {
  validateUniswapApproval,
  validateUniswapSwap
} from "../phases/uniswap-v3-fixed-swap/validation";

const financialOperationReal = { ...financialOperationNamespace };
const operationAttempts: string[] = [];

mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({ attemptClass, perform }: { attemptClass: string; perform(key: string): Promise<unknown> }) => {
    operationAttempts.push(attemptClass);
    return perform(`test-${attemptClass}`);
  }
}));

const { UniswapApproveExecutor, UniswapSwapExecutor } = await import("../phases/uniswap-v3-fixed-swap/execution");

afterAll(() => {
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

const ephemeral = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const inputAmountRaw = "100000000000000000000";

async function simulation() {
  let deploymentChecks = 0;
  const result = await simulateUniswapV3FixedSwap(
    { amount: new Big("100"), amountRaw: inputAmountRaw, chain: Networks.Polygon, token: "EURE" },
    {
      addNote() {},
      notes: [],
      now: new Date("2026-01-01T00:00:00.000Z"),
      partner: null,
      request: {} as never
    },
    {
      quote: async amountIn => {
        expect(amountIn).toBe(BigInt(inputAmountRaw));
        return 116_000_000n;
      },
      verifyDeployment: async () => {
        deploymentChecks++;
      }
    }
  );
  expect(deploymentChecks).toBe(1);
  return result;
}

async function sign(unsigned: PresignedTx): Promise<PresignedTx> {
  if (typeof unsigned.txData === "string" || Array.isArray(unsigned.txData)) throw new Error("Expected EVM transaction data");
  const txData = unsigned.txData as EvmTransactionData;
  const serialized = await ephemeral.signTransaction({
    chainId: 137,
    data: txData.data as `0x${string}`,
    gas: BigInt(txData.gas),
    maxFeePerGas: BigInt(txData.maxFeePerGas as string),
    maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas as string),
    nonce: unsigned.nonce,
    to: txData.to as `0x${string}`,
    type: "eip1559",
    value: BigInt(txData.value)
  });
  return { ...unsigned, txData: serialized };
}

describe("fixed Polygon Uniswap V3 EURe/USDC swap", () => {
  it("quotes the pinned pool without exposing EURE through the public token registry", async () => {
    const result = await simulation();

    expect(result.output).toMatchObject({
      amountRaw: "116000000",
      chain: Networks.Polygon,
      token: EvmToken.USDC
    });
    expect(result.output.amount.toFixed()).toBe("116");
    expect(result.metadata).toMatchObject({
      fee: POLYGON_EURE_USDC_FEE,
      inputToken: POLYGON_EURE,
      outputToken: POLYGON_USDC,
      pool: POLYGON_EURE_USDC_POOL,
      router: POLYGON_UNISWAP_V3_ROUTER
    });
  });

  it("prepares exact approval, fixed-pool swap, cleanup, and native prefunding", async () => {
    const simulated = await simulation();
    const prepared = await prepareUniswapV3FixedSwapTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } } } as never,
        ownMetadata: simulated.metadata,
        ownRegistrationFacts: undefined,
        quote: {} as never
      },
      {
        now: () => 1_700_000_000_000,
        probeFees: async () => ({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n })
      }
    );
    const [approval, swap, cleanup] = allocateNonces(prepared.intents);
    const state = prepared.state as UniswapV3FixedSwapPreparation;
    const approvalCall = decodeFunctionData({
      abi: erc20Abi,
      data: (approval.txData as { data: `0x${string}` }).data
    });
    const swapCall = decodeFunctionData({
      abi: uniswapV3RouterAbi,
      data: (swap.txData as { data: `0x${string}` }).data
    });
    const params = swapCall.args[0];

    expect(prepared.intents.map(intent => intent.phase)).toEqual(["uniswapApprove", "uniswapSwap", "polygonCleanup"]);
    expect(approvalCall.args).toEqual([POLYGON_UNISWAP_V3_ROUTER, BigInt(inputAmountRaw)]);
    expect(params).toMatchObject({
      amountIn: BigInt(inputAmountRaw),
      amountOutMinimum: 110_200_000n,
      fee: POLYGON_EURE_USDC_FEE,
      recipient: ephemeral.address,
      sqrtPriceLimitX96: 0n,
      tokenIn: POLYGON_EURE,
      tokenOut: POLYGON_USDC
    });
    expect(state).toEqual({
      deadline: "1700604800",
      hardMinimumOutputRaw: "110200000",
      softMinimumOutputRaw: "113680000"
    });
    expect(prepared.intents.map(intent => intent.prefundNativeValueRaw)).toEqual([
      "600000000000000",
      "3000000000000000",
      "600000000000000"
    ]);
    expect(cleanup.network).toBe(Networks.Polygon);

    const expectation = {
      amountInRaw: inputAmountRaw,
      deadline: state.deadline,
      hardMinimumOutputRaw: state.hardMinimumOutputRaw,
      signer: ephemeral.address
    };
    await expect(validateUniswapApproval(await sign(approval), expectation)).resolves.toStartWith("0x");
    await expect(validateUniswapSwap(await sign(swap), expectation)).resolves.toStartWith("0x");
  });

  it("executes the exact approval and swap with deployment, quote, and balance checks", async () => {
    operationAttempts.length = 0;
    const simulated = await simulation();
    const prepared = await prepareUniswapV3FixedSwapTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } } } as never,
        ownMetadata: simulated.metadata,
        ownRegistrationFacts: undefined,
        quote: {} as never
      },
      {
        now: () => Date.now(),
        probeFees: async () => ({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n })
      }
    );
    const [approvalBlueprint, swapBlueprint] = allocateNonces(prepared.intents);
    const signedApproval = await sign(approvalBlueprint);
    const signedSwap = await sign(swapBlueprint);
    const originalFindByPk = QuoteTicket.findByPk;
    QuoteTicket.findByPk = mock(async () => ({
      metadata: { blocks: { uniswapV3FixedSwap: simulated.metadata } }
    })) as typeof QuoteTicket.findByPk;
    const state = {
      currentPhase: "uniswapApprove",
      errorLogs: [],
      get() {
        return this;
      },
      id: "ramp-uniswap-1",
      phaseHistory: [],
      presignedTxs: [signedApproval, signedSwap],
      quoteId: "quote-uniswap-1",
      state: {
        blockState: { uniswapV3FixedSwap: prepared.state },
        evmEphemeralAddress: ephemeral.address,
        flow: { id: "test-flow", version: 1 }
      },
      unsignedTxs: [approvalBlueprint, swapBlueprint],
      async update(update: Record<string, unknown>) {
        Object.assign(this, update);
        return this;
      }
    } as never;
    let allowance = 0n;
    let outputBalance = 0n;
    let deploymentChecks = 0;
    let simulations = 0;

    try {
      await new UniswapApproveExecutor({
        getAllowance: async () => allowance,
        getBalance: async () => 0n,
        getReceipt: async () => null,
        quote: async () => 116_000_000n,
        sendRawTransaction: async transaction => {
          allowance = BigInt(inputAmountRaw);
          return (await import("viem")).keccak256(transaction);
        },
        simulateTransaction: async () => {},
        verifyDeployment: async () => {},
        waitForReceipt: async () => ({ status: "success" })
      }).execute(state);

      (state as { currentPhase: string }).currentPhase = "uniswapSwap";
      await new UniswapSwapExecutor({
        getAllowance: async () => allowance,
        getBalance: async token => (token === POLYGON_EURE ? BigInt(inputAmountRaw) : outputBalance),
        getReceipt: async () => null,
        quote: async () => 116_000_000n,
        sendRawTransaction: async transaction => {
          allowance = 0n;
          outputBalance = 116_000_000n;
          return (await import("viem")).keccak256(transaction);
        },
        simulateTransaction: async () => {
          simulations++;
        },
        verifyDeployment: async () => {
          deploymentChecks++;
        },
        waitForReceipt: async () => ({ status: "success" })
      }).execute(state);
    } finally {
      QuoteTicket.findByPk = originalFindByPk;
    }

    expect(operationAttempts).toEqual(["uniswap-presigned-broadcast", "uniswap-presigned-broadcast"]);
    expect(deploymentChecks).toBe(1);
    expect(simulations).toBe(1);
    expect(allowance).toBe(0n);
    expect(outputBalance).toBe(116_000_000n);
  });
});
