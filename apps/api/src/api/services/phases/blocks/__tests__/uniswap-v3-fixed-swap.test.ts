import { afterAll, describe, expect, it, mock } from "bun:test";
import { EphemeralAccountType, type EvmTransactionData, EvmToken, Networks, type PresignedTx } from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, encodeFunctionData, encodePacked, erc20Abi, keccak256 } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError } from "../../../../errors/phase-error";
import * as financialOperationNamespace from "../core/financial-operation";
import { allocateNonces } from "../core/prepare";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_PATH,
  POLYGON_EURE_USDC_ROUTE,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC,
  POLYGON_USDCE,
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

type SwapParams = {
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
  path: `0x${string}`;
  recipient: `0x${string}`;
};

/** Prepares the fixed route for the shared ephemeral at `now`, returning blueprints and the persisted state. */
async function prepared(now = Date.now()) {
  const simulated = await simulation();
  const result = await prepareUniswapV3FixedSwapTxs(
    {
      accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
      globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } } } as never,
      ownMetadata: simulated.metadata,
      ownRegistrationFacts: undefined,
      quote: {} as never
    },
    { now: () => now, probeFees: async () => ({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n }) }
  );
  const [approval, swap] = allocateNonces(result.intents);
  const state = result.state as UniswapV3FixedSwapPreparation;
  const expectation = {
    amountInRaw: inputAmountRaw,
    deadline: state.deadline,
    hardMinimumOutputRaw: state.hardMinimumOutputRaw,
    signer: ephemeral.address
  };
  return { approval, expectation, simulated, state, swap };
}

function withData(blueprint: PresignedTx, patch: Partial<EvmTransactionData>): PresignedTx {
  return { ...blueprint, txData: { ...(blueprint.txData as EvmTransactionData), ...patch } };
}

function swapParamsOf(blueprint: PresignedTx): SwapParams {
  const decoded = decodeFunctionData({ abi: uniswapV3RouterAbi, data: (blueprint.txData as EvmTransactionData).data as `0x${string}` });
  return decoded.args[0] as SwapParams;
}

function encodeSwap(params: SwapParams): `0x${string}` {
  return encodeFunctionData({ abi: uniswapV3RouterAbi, args: [params], functionName: "exactInput" });
}

describe("fixed Polygon Uniswap V3 EURe/USDC swap", () => {
  it("quotes the pinned two-hop path without exposing EURE through the public token registry", async () => {
    const result = await simulation();

    expect(result.output).toMatchObject({
      amountRaw: "116000000",
      chain: Networks.Polygon,
      token: EvmToken.USDC
    });
    expect(result.output.amount.toFixed()).toBe("116");
    expect(result.metadata).toMatchObject({
      inputToken: POLYGON_EURE,
      outputToken: POLYGON_USDC,
      path: POLYGON_EURE_USDC_PATH,
      pools: POLYGON_EURE_USDC_ROUTE.map(hop => hop.pool),
      router: POLYGON_UNISWAP_V3_ROUTER
    });
  });

  it("prepares exact approval, fixed-path swap, cleanup, and native prefunding", async () => {
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
      path: POLYGON_EURE_USDC_PATH,
      recipient: ephemeral.address
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

describe("fixed Polygon Uniswap V3 route validation", () => {
  const stranger = privateKeyToAccount(generatePrivateKey());
  const OTHER_TOKEN = "0x1111111111111111111111111111111111111111" as const;

  it.each<[string, (approval: PresignedTx) => PresignedTx | Promise<PresignedTx>]>([
    ["a different spender", approval =>
      withData(approval, {
        data: encodeFunctionData({ abi: erc20Abi, args: [OTHER_TOKEN, BigInt(inputAmountRaw)], functionName: "approve" })
      })],
    ["an approval above the fixed input", approval =>
      withData(approval, {
        data: encodeFunctionData({ abi: erc20Abi, args: [POLYGON_UNISWAP_V3_ROUTER, BigInt(inputAmountRaw) + 1n], functionName: "approve" })
      })],
    ["a token other than EURe", approval => withData(approval, { to: OTHER_TOKEN })],
    ["a transfer instead of an approval", approval =>
      withData(approval, {
        data: encodeFunctionData({ abi: erc20Abi, args: [POLYGON_UNISWAP_V3_ROUTER, BigInt(inputAmountRaw)], functionName: "transfer" })
      })],
    ["a native value attached", approval => withData(approval, { value: "1" })],
    ["a signer other than the ephemeral", async approval => {
      const txData = approval.txData as EvmTransactionData;
      const serialized = await stranger.signTransaction({
        chainId: 137,
        data: txData.data as `0x${string}`,
        gas: BigInt(txData.gas),
        maxFeePerGas: BigInt(txData.maxFeePerGas as string),
        maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas as string),
        nonce: approval.nonce,
        to: txData.to as `0x${string}`,
        type: "eip1559",
        value: 0n
      });
      return { ...approval, signer: stranger.address, txData: serialized };
    }]
  ])("rejects an approval with %s", async (_label, mutate) => {
    const { approval, expectation } = await prepared();
    const mutated = await mutate(approval);
    const signed = typeof mutated.txData === "string" ? mutated : await sign(mutated);
    await expect(validateUniswapApproval(signed, expectation)).rejects.toThrow();
  });

  const pathTypes = ["address", "uint24", "address", "uint24", "address"] as const;
  it.each<[string, (params: SwapParams) => Partial<SwapParams>]>([
    ["output token", () => ({ path: encodePacked(pathTypes, [POLYGON_EURE, 3000, POLYGON_USDCE, 100, OTHER_TOKEN]) })],
    ["intermediate token", () => ({ path: encodePacked(pathTypes, [POLYGON_EURE, 3000, OTHER_TOKEN, 100, POLYGON_USDC]) })],
    ["fee tier", () => ({ path: encodePacked(pathTypes, [POLYGON_EURE, 500, POLYGON_USDCE, 100, POLYGON_USDC]) })],
    ["hop count", () => ({ path: encodePacked(["address", "uint24", "address"], [POLYGON_EURE, 500, POLYGON_USDC]) })],
    ["recipient", () => ({ recipient: OTHER_TOKEN })],
    ["deadline", params => ({ deadline: params.deadline + 1n })],
    ["amountIn", params => ({ amountIn: params.amountIn + 1n })],
    ["amountOutMinimum", params => ({ amountOutMinimum: params.amountOutMinimum - 1n })]
  ])("rejects a swap whose %s differs from the fixed route", async (_label, mutate) => {
    const { expectation, swap } = await prepared();
    const params = swapParamsOf(swap);
    const signed = await sign(withData(swap, { data: encodeSwap({ ...params, ...mutate(params) }) }));
    await expect(validateUniswapSwap(signed, expectation)).rejects.toThrow("does not match the fixed Polygon EURe/USDC route");
  });

  it("rejects a swap sent to a router other than the pinned one", async () => {
    const { expectation, swap } = await prepared();
    const signed = await sign(withData(swap, { to: OTHER_TOKEN }));
    await expect(validateUniswapSwap(signed, expectation)).rejects.toThrow("signer or router does not match");
  });

  it("rejects a swap that is not exactInput", async () => {
    const { expectation, swap } = await prepared();
    const signed = await sign(
      withData(swap, {
        data: encodeFunctionData({ abi: erc20Abi, args: [POLYGON_UNISWAP_V3_ROUTER, 1n], functionName: "approve" })
      })
    );
    await expect(validateUniswapSwap(signed, expectation)).rejects.toThrow();
  });
});

describe("fixed Polygon Uniswap V3 execution failure branches", () => {
  const originalFindByPk = QuoteTicket.findByPk;

  function rampState(approval: PresignedTx, swap: PresignedTx, signedApproval: PresignedTx, signedSwap: PresignedTx, state: unknown) {
    return {
      currentPhase: "uniswapSwap",
      errorLogs: [],
      get() {
        return this;
      },
      id: "ramp-uniswap-failure",
      phaseHistory: [],
      presignedTxs: [signedApproval, signedSwap],
      quoteId: "quote-uniswap-failure",
      state: {
        blockState: { uniswapV3FixedSwap: state },
        evmEphemeralAddress: ephemeral.address,
        flow: { id: "test-flow", version: 1 }
      },
      unsignedTxs: [approval, swap],
      async update(update: Record<string, unknown>) {
        Object.assign(this, update);
        return this;
      }
    } as never;
  }

  type Deps = ConstructorParameters<typeof UniswapSwapExecutor>[0];

  function happyDependencies(overrides: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> {
    let allowance = BigInt(inputAmountRaw);
    let outputBalance = 0n;
    return {
      getAllowance: async () => allowance,
      getBalance: async token => (token === POLYGON_EURE ? BigInt(inputAmountRaw) : outputBalance),
      getReceipt: async () => null,
      quote: async () => 116_000_000n,
      sendRawTransaction: async transaction => {
        allowance = 0n;
        outputBalance = 116_000_000n;
        return keccak256(transaction);
      },
      simulateTransaction: async () => {},
      verifyDeployment: async () => {},
      waitForReceipt: async () => ({ status: "success" }),
      ...overrides
    };
  }

  async function runSwap(overrides: Partial<NonNullable<Deps>>, now = Date.now()) {
    operationAttempts.length = 0;
    const { approval, simulated, state, swap } = await prepared(now);
    const signedApproval = await sign(approval);
    const signedSwap = await sign(swap);
    QuoteTicket.findByPk = mock(async () => ({
      metadata: { blocks: { uniswapV3FixedSwap: simulated.metadata } }
    })) as typeof QuoteTicket.findByPk;
    try {
      return await new UniswapSwapExecutor(happyDependencies(overrides))
        .execute(rampState(approval, swap, signedApproval, signedSwap, state))
        .then(() => null)
        .catch((error: unknown) => error);
    } finally {
      QuoteTicket.findByPk = originalFindByPk;
    }
  }

  it("retries later when the signed deadline has already passed", async () => {
    const error = await runSwap({}, Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect((error as Error).message).toContain("expired");
    expect(operationAttempts).toEqual([]);
  });

  it("retries later while the EURe has not reached the ephemeral", async () => {
    const error = await runSwap({ getBalance: async () => 0n });
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect((error as Error).message).toContain("has not reached the ephemeral");
    expect(operationAttempts).toEqual([]);
  });

  it("pauses when the router allowance does not match the exact input", async () => {
    const error = await runSwap({ getAllowance: async () => BigInt(inputAmountRaw) - 1n });
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("allowance");
    expect(operationAttempts).toEqual([]);
  });

  it("finishes a resumed swap whose transaction already settled instead of pausing", async () => {
    // Crash after the swap was mined: the allowance is consumed and the EURe is gone, but the
    // deterministic hash already has a successful receipt.
    const sendRawTransaction = mock(async (): Promise<`0x${string}`> => {
      throw new Error("must not resend a settled swap");
    });
    const simulateTransaction = mock(async () => {
      throw new Error("must not simulate a settled swap");
    });
    const error = await runSwap({
      getAllowance: async () => 0n,
      getBalance: async token => (token === POLYGON_EURE ? 0n : 116_000_000n),
      getReceipt: async () => ({ status: "success" }),
      sendRawTransaction,
      simulateTransaction
    });
    expect(error).toBeNull();
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(simulateTransaction).not.toHaveBeenCalled();
    expect(operationAttempts).toEqual([]);
  });

  it("retries later when the live quote moved below the soft minimum", async () => {
    const error = await runSwap({ quote: async () => 113_679_999n });
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect((error as Error).message).toContain("soft minimum");
    expect(operationAttempts).toEqual([]);
  });

  it("pauses when the swap leaves an allowance behind", async () => {
    let sent = false;
    const error = await runSwap({
      getAllowance: async () => (sent ? 1n : BigInt(inputAmountRaw)),
      getBalance: async token => (token === POLYGON_EURE ? BigInt(inputAmountRaw) : 116_000_000n),
      sendRawTransaction: async transaction => {
        sent = true;
        return keccak256(transaction);
      }
    });
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("left unexpected allowance");
    expect(operationAttempts).toEqual(["uniswap-presigned-broadcast"]);
  });

  it("pauses when the swap produced less USDC than the hard minimum", async () => {
    let sent = false;
    const error = await runSwap({
      getAllowance: async () => (sent ? 0n : BigInt(inputAmountRaw)),
      getBalance: async token => (token === POLYGON_EURE ? BigInt(inputAmountRaw) : sent ? 110_199_999n : 0n),
      sendRawTransaction: async transaction => {
        sent = true;
        return keccak256(transaction);
      }
    });
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("below");
    expect(operationAttempts).toEqual(["uniswap-presigned-broadcast"]);
  });

  it("pauses when the approval established a different allowance", async () => {
    operationAttempts.length = 0;
    const { approval, simulated, state, swap } = await prepared();
    const signedApproval = await sign(approval);
    const signedSwap = await sign(swap);
    QuoteTicket.findByPk = mock(async () => ({
      metadata: { blocks: { uniswapV3FixedSwap: simulated.metadata } }
    })) as typeof QuoteTicket.findByPk;
    const state_ = rampState(approval, swap, signedApproval, signedSwap, state) as { currentPhase: string };
    state_.currentPhase = "uniswapApprove";
    try {
      const error = await new UniswapApproveExecutor(happyDependencies({ getAllowance: async () => 1n }))
        .execute(state_ as never)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
      expect((error as Error).message).toContain("established allowance 1");
    } finally {
      QuoteTicket.findByPk = originalFindByPk;
    }
  });
});
