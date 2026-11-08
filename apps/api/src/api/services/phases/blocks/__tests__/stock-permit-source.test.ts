import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  EphemeralAccountType,
  EvmClientManager,
  EvmToken,
  FiatToken,
  Networks,
  type PresignedTx,
  RampDirection,
  type SignedTypedData,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { Signature as EvmSignature } from "ethers";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  decodeFunctionData,
  erc20Abi,
  HttpRequestError,
  keccak256,
  parseAbi
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { installFakeFinancialJournal } from "../../../../../test-utils/fake-financial-journal";
import { installFakeChainIdRpc } from "../../../../../test-utils/fake-world/fake-evm";
import { RecoverablePhaseError, ReconciliationRequiredPhaseError, UnrecoverablePhaseError } from "../../../../errors/phase-error";
import { verifyUserSubmittedTxByHash } from "../../../phases/helpers/user-tx-verifier";
import { priceFeedService } from "../../../priceFeed.service";
import { validatePresignedTxs } from "../../../transactions/validation";
import { aggregateNativePrefunding, allocateNonces } from "../core/prepare";
import { ROBINHOOD_STOCKS } from "../core/robinhood-stocks";
import type { PhaseCtx, PrepareCtx } from "../core/types";
import { moneriumTransferFromAbi } from "../phases/monerium-self-transfer/contract";
import { registerStockPermitSource } from "../phases/stock-permit-source/registration";
import {
  probeStockPermit,
  simulateStockPermitSource,
  StockPermitSourceContext,
  type StockPermitSourceMetadata
} from "../phases/stock-permit-source/simulation";
import { prepareStockPermitSourceTxs } from "../phases/stock-permit-source/transactions";

const journal = installFakeFinancialJournal();
const { StockPermitTransferExecutor } = await import("../phases/stock-permit-source/execution");
type Dependencies = NonNullable<ConstructorParameters<typeof StockPermitTransferExecutor>[0]>;

afterAll(() => journal.restore());
beforeEach(() => journal.reset());
afterEach(() => mock.restore());

const EPHEMERAL_KEY = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const owner = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const ephemeral = privateKeyToAccount(EPHEMERAL_KEY);
const NVDA = EvmToken.NVDA;
const TOKEN_ADDRESS = ROBINHOOD_STOCKS.NVDA.address;
const AMOUNT_RAW = "2500000000000000000";
const AMOUNT = BigInt(AMOUNT_RAW);
const PREPARED_AT_MS = 1_800_000_000_000;
const DEADLINE_MS = PREPARED_AT_MS + 60 * 60 * 1000;
const FEES = { maxFeePerGas: 30_000_000n, maxPriorityFeePerGas: 0n };
const PERMIT_NONCE = 7n;
const DOMAIN = { chainId: 4663, name: "NVIDIA • Robinhood Token", verifyingContract: TOKEN_ADDRESS, version: "1" };

const metadata: StockPermitSourceMetadata = {
  amountRaw: AMOUNT_RAW,
  gasless: true,
  network: Networks.Robinhood,
  networkFeeUsd: "0.5",
  token: NVDA
};

function prepare(
  permit: { domain: typeof DOMAIN; nonce: bigint } | null = { domain: DOMAIN, nonce: PERMIT_NONCE },
  gasless = permit !== null
) {
  return prepareStockPermitSourceTxs(
    {
      accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
      globals: {} as never,
      ownMetadata: { ...metadata, gasless },
      ownRegistrationFacts: { owner: owner.address },
      quote: {} as never
    } as PrepareCtx<StockPermitSourceMetadata, { owner: string }>,
    { now: () => PREPARED_AT_MS, probeFees: async () => FEES, probePermit: async () => permit }
  );
}

async function signEphemeral(unsigned: UnsignedTx[]): Promise<PresignedTx[]> {
  const restoreChainIdRpc = installFakeChainIdRpc();
  return signUnsignedTransactions(
    unsigned.filter(tx => tx.signer === ephemeral.address),
    { evmEphemeral: { address: ephemeral.address, secret: EPHEMERAL_KEY } }
  ).finally(restoreChainIdRpc);
}

async function signPermit(blueprint: UnsignedTx, message?: Record<string, unknown>): Promise<PresignedTx> {
  const unsigned = blueprint.txData as SignedTypedData;
  const signature = EvmSignature.from(
    await owner.signTypedData({
      domain: unsigned.domain,
      message: message ?? unsigned.message,
      primaryType: unsigned.primaryType,
      types: unsigned.types
    } as Parameters<typeof owner.signTypedData>[0])
  );
  return {
    ...blueprint,
    txData: [
      {
        ...unsigned,
        message: message ?? unsigned.message,
        signature: {
          deadline: Number(unsigned.message.deadline),
          r: signature.r as `0x${string}`,
          s: signature.s as `0x${string}`,
          v: signature.v
        }
      }
    ]
  };
}

const EPHEMERALS = { EVM: ephemeral.address, Substrate: "" };

async function signedRamp() {
  const prepared = await prepare();
  const unsignedTxs = allocateNonces(prepared.intents);
  const [permitBlueprint] = unsignedTxs;
  const presignedTxs = [await signPermit(permitBlueprint), ...(await signEphemeral(unsignedTxs))];
  return rampState({ presignedTxs, stateBlock: prepared.state as Record<string, unknown>, unsignedTxs });
}

function rampState({
  presignedTxs,
  stateBlock,
  stateFields = {},
  unsignedTxs
}: {
  presignedTxs: PresignedTx[];
  stateBlock: Record<string, unknown>;
  stateFields?: Record<string, unknown>;
  unsignedTxs: UnsignedTx[];
}) {
  const state = {
    currentPhase: "stockPermitTransfer",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs,
    state: {
      blockState: { [StockPermitSourceContext.key]: stateBlock },
      evmEphemeralAddress: ephemeral.address,
      flow: { id: "test-flow", version: 1 },
      ...stateFields
    },
    unsignedTxs,
    async update(patch: Record<string, unknown>) {
      Object.assign(state, patch);
      return state;
    }
  };
  return state as never;
}

interface FakeChain {
  allowance: bigint;
  ephemeralNonce: number;
  ownerBalance: bigint;
  paused: boolean;
  permitNonce: bigint;
  permits: unknown[][];
  raw: `0x${string}`[];
  receipts: Map<string, { status: "success" | "reverted" }>;
}

function fakeChain(overrides: Partial<Dependencies> = {}, start: Partial<FakeChain> = {}) {
  const chain: FakeChain = {
    allowance: 0n,
    ephemeralNonce: 0,
    ownerBalance: AMOUNT,
    paused: false,
    permitNonce: PERMIT_NONCE,
    permits: [],
    raw: [],
    receipts: new Map(),
    ...start
  };
  const dependencies: Dependencies = {
    getAllowance: async () => chain.allowance,
    getBalance: async () => chain.ownerBalance,
    getPermitNonce: async () => chain.permitNonce,
    getReceipt: async hash => chain.receipts.get(hash) ?? null,
    getTransactionCount: async () => chain.ephemeralNonce,
    now: () => PREPARED_AT_MS + 1000,
    readStockFlags: async () => ({ paused: chain.paused }),
    sendPermit: async (_token, args) => {
      chain.permits.push([...args]);
      chain.permitNonce += 1n;
      chain.allowance = args[2];
      const hash = keccak256(`0x${chain.permits.length.toString(16).padStart(2, "0")}`);
      chain.receipts.set(hash, { status: "success" });
      return hash;
    },
    sendRawTransaction: async transaction => {
      chain.raw.push(transaction);
      chain.ephemeralNonce += 1;
      chain.allowance -= AMOUNT;
      chain.ownerBalance -= AMOUNT;
      const hash = keccak256(transaction);
      chain.receipts.set(hash, { status: "success" });
      return hash;
    },
    verifyUserTransfer: mock(async () => undefined),
    waitForBalance: mock(async () => undefined),
    waitForReceipt: async hash => {
      const receipt = chain.receipts.get(hash);
      if (!receipt) throw new Error(`no receipt for ${hash}`);
      return receipt;
    },
    ...overrides
  };
  return { chain, dependencies, executor: new StockPermitTransferExecutor(dependencies) };
}

describe("StockPermitSource transactions", () => {
  it("issues the owner's permit and the ephemeral's exact transferFrom, with their own nonce lanes", async () => {
    const prepared = await prepare();
    const [permit, transfer] = allocateNonces(prepared.intents);

    expect(prepared.intents.map(intent => [intent.phase, intent.network, intent.lane, intent.signer])).toEqual([
      ["stockPermitTransfer", Networks.Robinhood, "main", owner.address],
      ["stockPermitTransfer", Networks.Robinhood, "main", ephemeral.address]
    ]);
    expect([permit.nonce, transfer.nonce]).toEqual([0, 0]);
    expect(prepared.state).toEqual({ amountRaw: AMOUNT_RAW, owner: owner.address, token: NVDA });

    expect(permit.txData).toMatchObject({
      domain: DOMAIN,
      message: {
        deadline: String(DEADLINE_MS / 1000),
        nonce: PERMIT_NONCE.toString(),
        owner: owner.address,
        spender: ephemeral.address,
        value: AMOUNT_RAW
      },
      primaryType: "Permit"
    });

    const txData = transfer.txData as { data: `0x${string}`; gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string; to: string };
    expect(txData).toMatchObject({ gas: "200000", maxFeePerGas: "30000000", maxPriorityFeePerGas: "0", to: TOKEN_ADDRESS, value: "0" });
    expect(decodeFunctionData({ abi: moneriumTransferFromAbi, data: txData.data })).toMatchObject({
      args: [owner.address, ephemeral.address, AMOUNT],
      functionName: "transferFrom"
    });
    expect(aggregateNativePrefunding(prepared.intents)).toEqual({
      [`${Networks.Robinhood}:${ephemeral.address.toLowerCase()}`]: (200_000n * FEES.maxFeePerGas * 3n).toString()
    });
  });

  it("answers 503 when the quote said gasless and the permit is gone at registration, rather than asking for ETH", async () => {
    await expect(prepare(null, true)).rejects.toMatchObject({
      message: "Selling this token is temporarily unavailable. Please try again later.",
      status: 503
    });
  });

  it("falls back to one user-signed transfer with real fee fields when the token has no permit", async () => {
    const prepared = await prepare(null);
    const [transfer, ...rest] = allocateNonces(prepared.intents);

    expect(rest).toEqual([]);
    expect(prepared.state).toEqual({ amountRaw: AMOUNT_RAW, isNoPermitFallback: true, owner: owner.address, token: NVDA });
    expect(transfer).toMatchObject({ network: Networks.Robinhood, phase: "squidRouterNoPermitTransfer", signer: owner.address });
    const txData = transfer.txData as { data: `0x${string}` };
    expect(txData).toMatchObject({ gas: "85000", maxFeePerGas: "30000000", maxPriorityFeePerGas: "0", to: TOKEN_ADDRESS, value: "0" });
    expect(decodeFunctionData({ abi: erc20Abi, data: txData.data })).toMatchObject({
      args: [ephemeral.address, AMOUNT],
      functionName: "transfer"
    });
    expect(aggregateNativePrefunding(prepared.intents)).toEqual({});
  });
});

describe("StockPermitSource through validatePresignedTxs", () => {
  it("accepts the typed data and the ephemeral's transferFrom with its 4 extra nonces", async () => {
    const unsignedTxs = allocateNonces((await prepare()).intents);
    const signed = await signEphemeral(unsignedTxs);

    expect(signed).toHaveLength(1);
    expect(Object.keys(signed[0].meta.additionalTxs ?? {})).toHaveLength(4);
    await validatePresignedTxs(RampDirection.SELL, [await signPermit(unsignedTxs[0]), ...signed], EPHEMERALS, unsignedTxs);
  });

  it("releases the user permit on the ephemeral's signature alone, then requires it at start", async () => {
    const unsignedTxs = allocateNonces((await prepare()).intents);
    const signed = await signEphemeral(unsignedTxs);

    await validatePresignedTxs(RampDirection.SELL, signed, EPHEMERALS, unsignedTxs, { requireUserTypedData: false });
    await expect(validatePresignedTxs(RampDirection.SELL, signed, EPHEMERALS, unsignedTxs)).rejects.toThrow(
      "Not all unsigned transactions have a corresponding presigned transaction"
    );
  });

  it("rejects a permit whose signed value differs from the blueprint", async () => {
    const unsignedTxs = allocateNonces((await prepare()).intents);
    const message = { ...(unsignedTxs[0].txData as SignedTypedData).message, value: (AMOUNT + 1n).toString() };

    await expect(
      validatePresignedTxs(RampDirection.SELL, [await signPermit(unsignedTxs[0], message), ...(await signEphemeral(unsignedTxs))], EPHEMERALS, unsignedTxs)
    ).rejects.toThrow("does not match the server-issued unsigned typed data");
  });

  it("completes on a fallback blueprint alone and bars a presigned copy of it", async () => {
    const unsignedTxs = allocateNonces((await prepare(null)).intents);

    await validatePresignedTxs(RampDirection.SELL, [], EPHEMERALS, unsignedTxs);
    await expect(validatePresignedTxs(RampDirection.SELL, unsignedTxs, EPHEMERALS, unsignedTxs)).rejects.toThrow(
      "is broadcast by the user wallet"
    );
  });
});

describe("StockPermitTransferExecutor", () => {
  it("submits the permit, pulls the exact amount and records both hashes", async () => {
    const { chain, executor } = fakeChain();
    const state = await signedRamp();

    await executor.execute(state);

    expect(chain.permits).toHaveLength(1);
    expect(chain.permits[0].slice(0, 4)).toEqual([owner.address, ephemeral.address, AMOUNT, BigInt(DEADLINE_MS / 1000)]);
    expect(chain.raw).toHaveLength(1);
    expect(chain.ownerBalance).toBe(0n);
    expect(journal.attempts).toEqual(["stock-permit", "stock-permit-transfer-from"]);
    expect((state as { state: { blockState: Record<string, Record<string, unknown>> } }).state.blockState.stockPermitSource).toMatchObject({
      allowanceBeforeTransferRaw: AMOUNT_RAW,
      permitTxHash: expect.any(String),
      transferTxHash: keccak256(chain.raw[0])
    });
  });

  it("does nothing new when the phase re-enters after a crash past the transfer", async () => {
    const { chain, executor } = fakeChain();
    const state = await signedRamp();

    await executor.execute(state);
    await executor.execute(state);

    expect(chain.permits).toHaveLength(1);
    expect(chain.raw).toHaveLength(1);
  });

  it("recovers a transfer broadcast by a crashed attempt from its deterministic hash, without resending", async () => {
    const { chain, executor } = fakeChain();
    const state = await signedRamp();
    await executor.execute(state);
    journal.rows.set("stock-permit-transfer-from", { status: "submitted" });

    await executor.execute(state);

    expect(chain.raw).toHaveLength(1);
    expect(journal.rows.get("stock-permit-transfer-from")?.status).toBe("confirmed");
  });

  it("uses a permit someone else already consumed when its allowance is there", async () => {
    const { chain, executor } = fakeChain({}, { allowance: AMOUNT, permitNonce: PERMIT_NONCE + 1n });

    await executor.execute(await signedRamp());

    expect(chain.permits).toHaveLength(0);
    expect(chain.raw).toHaveLength(1);
    expect(journal.attempts).toEqual(["stock-permit-transfer-from"]);
  });

  it("fails the ramp when the permit's nonce was consumed and no allowance remains, since nothing was pulled", async () => {
    const { chain, executor } = fakeChain({}, { permitNonce: PERMIT_NONCE + 1n });

    await expect(executor.execute(await signedRamp())).rejects.toBeInstanceOf(UnrecoverablePhaseError);

    expect(chain.permits).toHaveLength(0);
    expect(chain.raw).toHaveLength(0);
  });

  /** The funding wallet's permit mines reverted; `landedFirst` has the same permit consumed by another sender before it. */
  function revertingPermitChain(landedFirst: boolean) {
    const fake = fakeChain();
    fake.dependencies.sendPermit = async (_token, args) => {
      fake.chain.permits.push([...args]);
      if (landedFirst) {
        fake.chain.permitNonce += 1n;
        fake.chain.allowance = args[2];
      }
      const hash = keccak256(`0x${fake.chain.permits.length.toString(16).padStart(2, "0")}`);
      fake.chain.receipts.set(hash, { status: "reverted" });
      return hash;
    };
    return fake;
  }

  it("fails the ramp on a mined permit revert that left the nonce unused, instead of resending it", async () => {
    const { chain, executor } = revertingPermitChain(false);

    await expect(executor.execute(await signedRamp())).rejects.toBeInstanceOf(UnrecoverablePhaseError);

    expect(chain.permits).toHaveLength(1);
    expect(chain.raw).toHaveLength(0);
    expect(chain.ownerBalance).toBe(AMOUNT);
  });

  it("pulls with the allowance when the same permit landed first and its own copy reverted", async () => {
    const { chain, executor } = revertingPermitChain(true);
    const state = await signedRamp();

    await executor.execute(state);
    await executor.execute(state);

    expect(chain.permits).toHaveLength(1);
    expect(chain.raw).toHaveLength(1);
    expect(chain.ownerBalance).toBe(0n);
  });

  it("never pulls once the permit's deadline has passed, even with the permit landed and the tokens back", async () => {
    const { chain, dependencies, executor } = fakeChain();
    dependencies.getBalance = async () => (chain.permits.length ? 0n : AMOUNT);
    const state = await signedRamp();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);
    expect(chain.allowance).toBe(AMOUNT);

    dependencies.getBalance = async () => AMOUNT;
    dependencies.now = () => DEADLINE_MS;

    await expect(executor.execute(state)).rejects.toBeInstanceOf(UnrecoverablePhaseError);
    expect(chain.raw).toHaveLength(0);
  });

  it("fails the ramp on an expired unconsumed permit, because the seller still holds the tokens", async () => {
    const { chain, executor } = fakeChain({ now: () => DEADLINE_MS });

    await expect(executor.execute(await signedRamp())).rejects.toBeInstanceOf(UnrecoverablePhaseError);

    expect(chain.permits).toHaveLength(0);
    expect(chain.raw).toHaveLength(0);
    expect(chain.ownerBalance).toBe(AMOUNT);
  });

  it("holds while the issuer has paused the token, before the user leg", async () => {
    const { chain, executor } = fakeChain({}, { paused: true });

    const error = await executor.execute(await signedRamp()).catch(value => value);

    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.permits).toHaveLength(0);
    expect(chain.raw).toHaveLength(0);
    expect(journal.attempts).toEqual([]);
  });

  it("retries when the owner holds too little, without spending the permit", async () => {
    const { chain, executor } = fakeChain({}, { ownerBalance: AMOUNT - 1n });
    const state = await signedRamp();

    const error = await executor.execute(state).catch(value => value);

    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.permits).toHaveLength(0);
    expect(journal.rows.get("stock-permit")).toBeUndefined();
  });

  it("fails the ramp on a mined transferFrom revert: its nonce is spent and the tokens never left", async () => {
    const { chain, executor } = fakeChain({
      sendRawTransaction: async transaction => {
        const hash = keccak256(transaction);
        chain.receipts.set(hash, { status: "reverted" });
        return hash;
      }
    });

    await expect(executor.execute(await signedRamp())).rejects.toBeInstanceOf(UnrecoverablePhaseError);
    expect(journal.rows.get("stock-permit-transfer-from")?.status).toBe("failed");
  });

  it("fails the ramp before any effect when a stored presigned transaction no longer validates", async () => {
    const { chain, executor } = fakeChain();
    const state = (await signedRamp()) as unknown as { presignedTxs: PresignedTx[] };
    const [permit] = state.presignedTxs;
    const [typed] = permit.txData as SignedTypedData[];
    state.presignedTxs[0] = { ...permit, txData: [{ ...typed, message: { ...typed.message, value: "1" } }] };

    await expect(executor.execute(state as never)).rejects.toBeInstanceOf(UnrecoverablePhaseError);

    expect(chain.permits).toHaveLength(0);
    expect(chain.raw).toHaveLength(0);
  });

  describe("no-permit fallback", () => {
    async function fallbackRamp(stateFields: Record<string, unknown> = {}) {
      const prepared = await prepare(null);
      return rampState({
        presignedTxs: [],
        stateBlock: prepared.state as Record<string, unknown>,
        stateFields,
        unsignedTxs: allocateNonces(prepared.intents)
      });
    }

    it("retries until the seller reports a hash", async () => {
      const { executor } = fakeChain({ verifyUserTransfer: verifyUserSubmittedTxByHash });

      await expect(executor.execute(await fallbackRamp())).rejects.toBeInstanceOf(RecoverablePhaseError);
    });

    it("verifies the reported transfer against its blueprint, then waits for the tokens", async () => {
      const verifyUserTransfer = mock(async () => undefined);
      const waitForBalance = mock(async () => undefined);
      const { chain, executor } = fakeChain({ verifyUserTransfer, waitForBalance });
      const hash = `0x${"ab".repeat(32)}`;

      await executor.execute(await fallbackRamp({ squidRouterNoPermitTransferHash: hash }));

      expect(verifyUserTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ fromNetwork: Networks.Robinhood, hash, presignedPhase: "squidRouterNoPermitTransfer" })
      );
      expect(waitForBalance).toHaveBeenCalledWith(TOKEN_ADDRESS, ephemeral.address, AMOUNT_RAW, undefined);
      expect(chain.permits).toHaveLength(0);
      expect(chain.raw).toHaveLength(0);
    });

    it("keeps a blueprint mismatch unrecoverable", async () => {
      const { executor } = fakeChain({
        verifyUserTransfer: async () => {
          throw new UnrecoverablePhaseError("calldata does not match");
        }
      });

      await expect(
        executor.execute(await fallbackRamp({ squidRouterNoPermitTransferHash: `0x${"ab".repeat(32)}` }))
      ).rejects.toBeInstanceOf(UnrecoverablePhaseError);
    });

    it("turns a transient RPC failure into a retry", async () => {
      const { executor } = fakeChain({
        verifyUserTransfer: async () => {
          throw new Error("rpc timeout");
        }
      });

      await expect(
        executor.execute(await fallbackRamp({ squidRouterNoPermitTransferHash: `0x${"ab".repeat(32)}` }))
      ).rejects.toBeInstanceOf(RecoverablePhaseError);
    });
  });
});

describe("StockPermitSource simulation", () => {
  const usdFees = { anchor: "0.2", network: "0", partnerMarkup: "0", total: "0.3", vortex: "0.1" };
  const input = { amount: new Big("2.5"), amountRaw: AMOUNT_RAW, chain: Networks.Robinhood, token: NVDA } as const;

  function ctx(): PhaseCtx {
    return {
      addNote() {},
      fees: {
        displayFiat: { anchor: "1", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "1.5", vortex: "0.5" },
        usd: usdFees
      },
      notes: [],
      now: new Date(PREPARED_AT_MS),
      partner: null,
      request: { from: Networks.Robinhood, rampType: RampDirection.SELL, to: "pix" }
    } as unknown as PhaseCtx;
  }

  it("passes the input through and charges the Robinhood Chain gas as the network fee", async () => {
    spyOn(priceFeedService, "convertCurrency").mockImplementation(async (amount: string, _from: string, to: string) =>
      to === FiatToken.BRL ? new Big(amount).mul(5).toString() : amount
    );
    const estimateExecutionFeeUsd = mock(async () => "0.4");

    const result = await simulateStockPermitSource(NVDA, input, ctx(), {
      estimateExecutionFeeUsd,
      probePermit: async () => ({ domain: DOMAIN, nonce: 0n })
    });

    expect(result.output).toBe(input);
    expect(result.metadata).toEqual({
      amountRaw: AMOUNT_RAW,
      gasless: true,
      network: Networks.Robinhood,
      networkFeeUsd: "0.4",
      token: NVDA
    });
    expect(estimateExecutionFeeUsd).toHaveBeenCalledWith(Networks.Robinhood, 1_000_000n);
    expect(result.fees?.usd?.network).toBe("0.4");
    expect(result.fees?.displayFiat?.network).toBe("2");
    expect(result.fees?.usd?.vortex).toBe("0.1");
  });

  it("reports no gasless route for a token without a permit", async () => {
    spyOn(priceFeedService, "convertCurrency").mockImplementation(async (amount: string) => amount);

    const result = await simulateStockPermitSource(NVDA, input, ctx(), {
      estimateExecutionFeeUsd: async () => "0.4",
      probePermit: async () => null
    });

    expect(result.metadata.gasless).toBe(false);
  });

  describe("probeStockPermit", () => {
    function installToken(readContract: (params: { functionName: string }) => Promise<unknown>) {
      spyOn(EvmClientManager, "getInstance").mockReturnValue({ getClient: () => ({ readContract }) } as never);
    }

    it("reads the nonce and resolves the standard domain", async () => {
      installToken(async ({ functionName }) => {
        if (functionName === "nonces") return 3n;
        if (functionName === "name") return DOMAIN.name;
        throw new Error(`${functionName} is not implemented`);
      });

      expect(await probeStockPermit(NVDA, owner.address)).toEqual({ domain: DOMAIN, nonce: 3n });
    });

    const abi = parseAbi(["function nonces(address owner) view returns (uint256)"]);
    const executionError = (cause: ConstructorParameters<typeof ContractFunctionExecutionError>[0]) =>
      new ContractFunctionExecutionError(cause, { abi, args: [owner.address], functionName: "nonces" });

    it("means no permit when the contract reverts", async () => {
      installToken(async () => {
        throw executionError(new ContractFunctionRevertedError({ abi, functionName: "nonces", message: "execution reverted" }));
      });

      expect(await probeStockPermit(NVDA, owner.address)).toBeNull();
    });

    it("means no permit when the contract returns no data", async () => {
      installToken(async () => {
        throw executionError(new ContractFunctionZeroDataError({ functionName: "nonces" }));
      });

      expect(await probeStockPermit(NVDA, owner.address)).toBeNull();
    });

    it("does not mistake a failed RPC call for a token without a permit", async () => {
      const failure = executionError(new HttpRequestError({ status: 503, url: "https://rpc.invalid" }));
      installToken(async () => {
        throw failure;
      });

      await expect(probeStockPermit(NVDA, owner.address)).rejects.toBe(failure);
    });

    it("rethrows anything else", async () => {
      installToken(async () => {
        throw new Error("boom");
      });

      await expect(probeStockPermit(NVDA, owner.address)).rejects.toThrow("boom");
    });

    // `@vortexfi/shared` bundles its own viem, so only its real client throws what production sees, and those errors
    // are not instances of this package's classes. The fake RPC stands in for the node behind that client.
    describe("over the real client", () => {
      function answerRpc(answer: (request: { id: number; method: string }) => Response) {
        spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: { body?: unknown }) =>
          answer(JSON.parse(String(init?.body)))) as typeof fetch);
      }
      const rpcError = (id: number, error: { code: number; data?: string; message: string }) =>
        Response.json({ error, id, jsonrpc: "2.0" });

      it("means no permit on an execution revert", async () => {
        answerRpc(({ id }) => rpcError(id, { code: 3, data: "0x", message: "execution reverted" }));

        expect(await probeStockPermit(NVDA, owner.address)).toBeNull();
      });

      it("means no permit when the token returns no data", async () => {
        answerRpc(({ id }) => Response.json({ id, jsonrpc: "2.0", result: "0x" }));

        expect(await probeStockPermit(NVDA, owner.address)).toBeNull();
      });

      it("rethrows when the node answers with an HTTP error", async () => {
        answerRpc(() => new Response("upstream down", { status: 503 }));

        await expect(probeStockPermit(NVDA, owner.address)).rejects.toThrow("HTTP request failed");
      });

      it("rethrows when the node rate limits the read", async () => {
        answerRpc(({ id }) => rpcError(id, { code: -32005, message: "rate limited" }));

        await expect(probeStockPermit(NVDA, owner.address)).rejects.toThrow();
      });
    });
  });
});

describe("StockPermitSource registration", () => {
  function register(walletAddress?: string) {
    return registerStockPermitSource({
      authenticatedUser: { id: "user" },
      input: { walletAddress },
      metadata,
      quote: { from: Networks.Robinhood, inputCurrency: NVDA, outputCurrency: FiatToken.BRL } as never,
      signingAccounts: []
    });
  }

  it("requires the seller's wallet", async () => {
    await expect(register()).rejects.toMatchObject({ message: "walletAddress is required for offramping", status: 400 });
  });

  it("rejects a wallet that is not an EVM address", async () => {
    await expect(register("not-an-address")).rejects.toMatchObject({ status: 400 });
  });

  it("keeps the seller as the permit owner", async () => {
    expect(await register(owner.address)).toEqual({ facts: { owner: owner.address } });
  });
});
