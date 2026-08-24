import { EvmToken, Networks, type QuoteResponse, RampDirection, type RampProcess, type UnsignedTx } from "@vortexfi/shared";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createActor, fromPromise, waitFor } from "xstate";
import type { TransferQuoteRequest } from "./transfer.actors";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage
});

mock.module("@/hooks/useTransactions", () => ({ TRANSACTIONS_QUERY_KEY: "transactions" }));
mock.module("@/lib/notify", () => ({ notifyTransferCompleted: () => undefined }));
mock.module("@/lib/queryClient", () => ({ queryClient: { invalidateQueries: () => undefined } }));
mock.module("@/services/transactions/userSigning", () => ({
  signAndSubmitEvmTransaction: () => {
    throw new Error("Unexpected wallet signing in transfer actor test");
  },
  signMultipleTypedData: () => {
    throw new Error("Unexpected wallet signing in transfer actor test");
  }
}));

const { transferMachine } = await import("./transfer.machine");

const quote = { id: "quote-buy", rampType: RampDirection.BUY } as QuoteResponse;
const quoteRequest: TransferQuoteRequest = {
  kind: "input",
  params: {
    corridorId: "MX",
    direction: RampDirection.BUY,
    inputAmount: "100",
    network: Networks.Polygon,
    token: EvmToken.USDC
  }
};
const ramp = { id: "ramp-buy", inputCurrency: "MXN", type: RampDirection.BUY } as RampProcess;

async function recoverySnapshot(ownerProfileId: string, accountId: string): Promise<string> {
  const machine = transferMachine.provide({
    actors: {
      refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
      registerTransfer: fromPromise(async () => ({ ramp: { ...ramp, id: `ramp-${ownerProfileId}` }, userTxs: [] as UnsignedTx[] }))
    }
  });
  const actor = createActor(machine).start();
  actor.send({ ownerProfileId, recovery: null, type: "ACTIVATE_OWNER" });
  actor.send({
    additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
    meta: {
      accountId,
      amountIn: "100",
      amountInToken: "MXN",
      corridorId: "MX",
      direction: RampDirection.BUY,
      fiatPayoutAmount: "5",
      ownerProfileId,
      payinNetwork: "polygon",
      payoutCurrency: "USDC",
      recipientEmail: "Your wallet",
      recipientId: "",
      summary: "5 USDC to your wallet"
    },
    ownerProfileId,
    quote,
    quoteRequest,
    type: "START"
  });
  await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
  const context = actor.getSnapshot().context;
  const persisted = JSON.stringify({ meta: context.meta, ownerProfileId, quote: context.quote, ramp: context.ramp, version: 1 });
  actor.stop();
  return persisted;
}

values.set("vortex-dashboard-transfer-state", "unowned legacy state");
const { activateTransferOwner, canChangeEffectiveIdentity, clearAllTransferRecovery, resetTransferState, transferActor } =
  await import("./transferActor");

after(() => {
  transferActor.stop();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("transferActor owner recovery", () => {
  it("rejects legacy state and restores only the selected owner's snapshot", async () => {
    assert.equal(values.has("vortex-dashboard-transfer-state"), false);
    const ownerOneKey = "vortex-dashboard-transfer-state:owner:profile-1";
    const ownerTwoKey = "vortex-dashboard-transfer-state:owner:profile-2";
    values.set(ownerOneKey, await recoverySnapshot("profile-1", "account-1"));
    values.set(ownerTwoKey, await recoverySnapshot("profile-2", "account-2"));

    assert.equal(activateTransferOwner("profile-1"), true);
    assert.equal(transferActor.getSnapshot().context.meta?.ownerProfileId, "profile-1");
    assert.equal(transferActor.getSnapshot().context.ramp?.id, "ramp-profile-1");
    const ownerOneRecovery = values.get(ownerOneKey);

    assert.equal(activateTransferOwner("profile-2"), true);
    assert.equal(values.get(ownerOneKey), ownerOneRecovery);
    assert.equal(transferActor.getSnapshot().context.meta?.ownerProfileId, "profile-2");
    assert.equal(transferActor.getSnapshot().context.ramp?.id, "ramp-profile-2");

    resetTransferState();
    assert.equal(values.has(ownerTwoKey), false);
    assert.equal(values.has(ownerOneKey), true);
    clearAllTransferRecovery();
    assert.equal(values.has(ownerOneKey), false);
  });

  it("removes mismatched snapshots instead of migrating them to an owner", async () => {
    const key = "vortex-dashboard-transfer-state:owner:profile-3";
    values.set(key, await recoverySnapshot("profile-else", "account-else"));

    assert.equal(activateTransferOwner("profile-3"), true);
    assert.equal(values.has(key), false);
    assert.equal(transferActor.getSnapshot().value, "Idle");
    assert.equal(transferActor.getSnapshot().context.activeOwnerProfileId, "profile-3");
  });

  it("removes truncated and unversioned recovery instead of mixing it with the active owner", async () => {
    const key = "vortex-dashboard-transfer-state:owner:profile-4";
    const complete = JSON.parse(await recoverySnapshot("profile-4", "account-4"));
    const corruptions = [
      { ...complete, version: undefined },
      { ...complete, ramp: undefined },
      { ...complete, meta: { ...complete.meta, ownerProfileId: "profile-else" } }
    ];

    for (const corruption of corruptions) {
      assert.equal(activateTransferOwner("profile-existing"), true);
      values.set(key, JSON.stringify(corruption));

      assert.equal(activateTransferOwner("profile-4"), true);
      assert.equal(values.has(key), false);
      assert.equal(transferActor.getSnapshot().value, "Idle");
      assert.equal(transferActor.getSnapshot().context.activeOwnerProfileId, "profile-4");
      assert.equal(transferActor.getSnapshot().context.meta, null);
      assert.equal(transferActor.getSnapshot().context.ramp, null);
    }

    values.set(key, "not-json");
    assert.equal(activateTransferOwner("profile-existing"), true);
    assert.equal(activateTransferOwner("profile-4"), true);
    assert.equal(values.has(key), false);
    assert.equal(transferActor.getSnapshot().context.meta, null);
  });

  it("preserves the active owner when reset clears its recovery", async () => {
    const key = "vortex-dashboard-transfer-state:owner:profile-5";
    values.set(key, await recoverySnapshot("profile-5", "account-5"));
    assert.equal(activateTransferOwner("profile-5"), true);

    resetTransferState();

    assert.equal(values.has(key), false);
    assert.equal(transferActor.getSnapshot().value, "Idle");
    assert.equal(transferActor.getSnapshot().context.activeOwnerProfileId, "profile-5");
  });

  it("allows identity changes while idle", () => {
    assert.equal(canChangeEffectiveIdentity(), true);
  });
});
