import { describe, expect, it } from "bun:test";
import {
  AssetHubToken,
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { FlowBuilder } from "../core/flow";
import { assetHubRequestIO, evmRequestIO, fiatRequestIO } from "../core/io";
import { defineContext } from "../core/metadata";
import { allocateNonces } from "../core/prepare";
import { resolveBlockQuoteExpiry } from "../core/quote";
import type { Phase, PhaseCtx, PhaseIO, TxIntent } from "../core/types";

function phaseCtx(inputCurrency: FiatToken | EvmToken | AssetHubToken, network: Networks, inputAmount = "1.25"): PhaseCtx {
  return {
    addNote: () => undefined,
    notes: [],
    now: new Date("2026-07-22T12:00:00.000Z"),
    partner: null,
    request: {
      from: network,
      inputAmount,
      inputCurrency,
      network,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.PIX
    }
  };
}

describe("block flow request IO", () => {
  it("converts EVM and AssetHub decimal amounts to configured raw units", async () => {
    expect((await evmRequestIO(EvmToken.USDC, Networks.Base)(phaseCtx(EvmToken.USDC, Networks.Base))).amountRaw).toBe(
      "1250000"
    );
    expect(
      (await assetHubRequestIO(AssetHubToken.DOT)(phaseCtx(AssetHubToken.DOT, Networks.AssetHub))).amountRaw
    ).toBe("12500000000");
  });

  it("rejects request chain and token mismatches", async () => {
    expect(() => evmRequestIO(EvmToken.USDC, Networks.Base)(phaseCtx(EvmToken.USDT, Networks.Base))).toThrow(
      "Expected on-chain flow input"
    );
    expect(() => assetHubRequestIO(AssetHubToken.USDC)(phaseCtx(AssetHubToken.USDC, Networks.Base))).toThrow(
      "Expected on-chain flow input"
    );
  });
});

function intent(overrides: Partial<TxIntent> = {}): TxIntent {
  return {
    lane: "main",
    network: Networks.Base,
    phase: "initial",
    signer: "0xabc",
    txData: "0x",
    ...overrides
  };
}

describe("block flow nonce allocation", () => {
  it("defaults to one nonce and advances by nonceSpan", () => {
    expect(allocateNonces([intent({ nonceSpan: 2 }), intent()]).map(tx => tx.nonce)).toEqual([0, 2]);
  });

  it("rejects zero and impossible pinned spans", () => {
    expect(() => allocateNonces([intent({ nonceSpan: 0 })])).toThrow("Invalid nonce span 0");
    expect(() => allocateNonces([intent({ nonceSpan: Number.MAX_SAFE_INTEGER }), intent()])).toThrow("safe nonce range");
    expect(() => allocateNonces([intent({ nonceSpan: 2, reuseFirstMainNonce: true })])).toThrow(
      "cannot combine reuseFirstMainNonce"
    );
  });

  it("isolates cursors by signer and network while preserving lanes", () => {
    const txs = allocateNonces([
      intent({ nonceSpan: 2 }),
      intent({ signer: "0xdef" }),
      intent({ network: Networks.Polygon }),
      intent({ lane: "backup" }),
      intent({ lane: "cleanup" })
    ]);
    expect(txs.map(tx => [tx.network, tx.signer, tx.nonce])).toEqual([
      [Networks.Base, "0xabc", 0],
      [Networks.Base, "0xdef", 0],
      [Networks.Polygon, "0xabc", 0],
      [Networks.Base, "0xabc", 2],
      [Networks.Base, "0xabc", 3]
    ]);
  });
});

const RegisteredContext = defineContext<{ version: number }>()("registered");
const PlainContext = defineContext<{ value: string }>()("plain");
type FiatBrlIO = PhaseIO<typeof FiatToken.BRL, "fiat">;

const RegisteredPhase: Phase<typeof RegisteredContext, FiatBrlIO, FiatBrlIO, { providerId: string }, { taxId: string }> = {
  context: RegisteredContext,
  name: "Registered",
  phases: [],
  prepareTxs: async ctx => ({ intents: [], state: { providerId: ctx.ownRegistrationFacts?.providerId } }),
  register: async ctx => {
    if (false) {
      // @ts-expect-error quote economics are read-only during registration
      ctx.quote.outputAmount = "changed";
    }
    return {
      facts: { providerId: `provider-${ctx.input.taxId}` },
      metadata: { version: ctx.metadata.version + 1 },
      responseArtifacts: { paymentReference: "reference" }
    };
  },
  simulate: async input => ({ metadata: { version: 1 }, output: input })
};

const PlainPhase: Phase<typeof PlainContext, FiatBrlIO, FiatBrlIO> = {
  context: PlainContext,
  name: "Plain",
  phases: [],
  prepareTxs: async ctx => ({ intents: [], state: { ownFacts: ctx.ownRegistrationFacts } }),
  simulate: async input => ({ metadata: { value: "plain" }, output: input })
};

describe("block flow registration", () => {
  it("namespaces facts, metadata refreshes, artifacts, and preparation input by phase key", async () => {
    const flow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), RegisteredPhase).pipe(PlainPhase).build("Registration");
    type RegistrationInput = Parameters<typeof flow.register>[0]["input"];
    // @ts-expect-error the registering phase requires normalized taxId input
    const _invalidRegistrationInput: RegistrationInput = {};
    void _invalidRegistrationInput;
    const metadata = {
      blocks: { plain: { value: "plain" }, registered: { version: 1 } },
      globals: { fees: {} as never, partner: null, request: phaseCtx(FiatToken.BRL, Networks.Base).request }
    };
    const registered = await flow.register({
      authenticatedUser: { id: "user" },
      input: { taxId: "123" },
      metadata,
      quote: {} as never,
      signingAccounts: [],
      transaction: undefined
    });

    expect(registered.registrationFacts).toEqual({ registered: { providerId: "provider-123" } });
    expect(registered.metadata.blocks.registered).toEqual({ version: 2 });
    expect(registered.responseArtifacts).toEqual({ registered: { paymentReference: "reference" } });

    const prepared = await flow.prepareTxs({
      accounts: {
        [EphemeralAccountType.Substrate]: { address: "substrate", type: EphemeralAccountType.Substrate }
      },
      metadata: registered.metadata,
      quote: {} as never,
      registrationFacts: registered.registrationFacts
    });
    expect(prepared.stateMeta.accountAddresses).toEqual({ Substrate: "substrate" });
    expect(prepared.stateMeta.blockState).toEqual({
      plain: { ownFacts: undefined },
      registered: { providerId: "provider-123" }
    });
  });
});

const ExpiringFirst: Phase<typeof RegisteredContext, FiatBrlIO, FiatBrlIO> = {
  context: RegisteredContext,
  name: "First",
  phases: [],
  simulate: async input => ({ expiresAt: new Date("2026-07-22T12:02:00.000Z"), metadata: { version: 1 }, output: input })
};

const ExpiringSecond: Phase<typeof PlainContext, FiatBrlIO, FiatBrlIO> = {
  context: PlainContext,
  name: "Second",
  phases: [],
  simulate: async input => ({ expiresAt: new Date("2026-07-22T12:01:00.000Z"), metadata: { value: "plain" }, output: input })
};

describe("block flow expiry", () => {
  it("propagates the earliest phase expiry", async () => {
    const flow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), ExpiringFirst).pipe(ExpiringSecond).build("Expiry");
    const result = await flow.simulate(phaseCtx(FiatToken.BRL, Networks.Base, "100"));
    expect(result.expiresAt).toEqual(new Date("2026-07-22T12:01:00.000Z"));
    expect(result.output.amount).toEqual(new Big(100));
  });

  it("uses provider expiry when present and the standard ticket TTL otherwise", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const providerExpiry = new Date("2026-07-22T12:00:30.000Z");
    expect(resolveBlockQuoteExpiry(providerExpiry, now)).toBe(providerExpiry);
    expect(resolveBlockQuoteExpiry(undefined, now)).toEqual(new Date("2026-07-22T12:10:00.000Z"));
  });
});
