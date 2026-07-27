import {
  EvmToken,
  Networks,
  type QuoteResponse,
  RampDirection,
  type RampProcess,
  type UnsignedTx
} from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActor, fromPromise, waitFor } from "xstate";
import type { TransferQuoteRequest } from "./transfer.actors";
import { transferMachine } from "./transfer.machine";

const quote = { id: "quote-buy", rampType: RampDirection.BUY } as QuoteResponse;
const quoteRequest: TransferQuoteRequest = {
  kind: "input" as const,
  params: {
    corridorId: "MX" as const,
    direction: RampDirection.BUY,
    inputAmount: "100",
    network: Networks.Polygon,
    token: EvmToken.USDC
  }
};
const ramp = {
  achPaymentData: { clabe: "646180157000000004" },
  id: "ramp-buy",
  inputCurrency: "MXN",
  type: RampDirection.BUY
} as RampProcess;

describe("transferMachine BUY flow", () => {
  it("waits for payment confirmation before starting the ramp", async () => {
    let startCalls = 0;
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
        registerTransfer: fromPromise(async () => ({ ramp, userTxs: [] as UnsignedTx[] })),
        startRamp: fromPromise(async () => {
          startCalls += 1;
          return ramp;
        }),
        trackRamp: fromPromise(async () => undefined) as never
      }
    });
    const actor = createActor(machine).start();

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "MXN",
        corridorId: "MX",
        direction: RampDirection.BUY,
        fiatPayoutAmount: "5",
        payinNetwork: "polygon",
        payoutCurrency: "USDC",
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: "5 USDC to your wallet"
      },
      quote,
      quoteRequest,
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    assert.equal(startCalls, 0);
    assert.equal(actor.getSnapshot().context.ramp?.achPaymentData?.clabe, "646180157000000004");

    actor.send({ type: "PAYMENT_CONFIRMED" });
    await waitFor(actor, snapshot => snapshot.matches("Tracking"));
    assert.equal(startCalls, 1);
    actor.stop();
  });

  it("returns to AwaitingPayment with the same ramp when start fails, and retries from there", async () => {
    let startCalls = 0;
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
        registerTransfer: fromPromise(async () => ({ ramp, userTxs: [] as UnsignedTx[] })),
        startRamp: fromPromise(async () => {
          startCalls += 1;
          if (startCalls === 1) {
            throw new Error("network blip");
          }
          return ramp;
        }),
        trackRamp: fromPromise(async () => undefined) as never
      }
    });
    const actor = createActor(machine).start();

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "MXN",
        corridorId: "MX",
        direction: RampDirection.BUY,
        fiatPayoutAmount: "5",
        payinNetwork: "polygon",
        payoutCurrency: "USDC",
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: "5 USDC to your wallet"
      },
      quote,
      quoteRequest,
      type: "START"
    });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));

    actor.send({ type: "PAYMENT_CONFIRMED" });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment") && snapshot.context.errorMessage !== null);
    const failed = actor.getSnapshot();
    assert.equal(startCalls, 1);
    assert.equal(failed.context.errorMessage, "network blip");
    assert.equal(failed.context.ramp?.id, "ramp-buy");

    actor.send({ type: "PAYMENT_CONFIRMED" });
    await waitFor(actor, snapshot => snapshot.matches("Tracking"));
    assert.equal(startCalls, 2);
    assert.equal(actor.getSnapshot().context.errorMessage, null);
    actor.stop();
  });

  it("returns to idle and clears an expired ramp while awaiting payment", async () => {
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
        registerTransfer: fromPromise(async () => ({ ramp, userTxs: [] as UnsignedTx[] }))
      }
    });
    const actor = createActor(machine).start();

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "MXN",
        corridorId: "MX",
        direction: RampDirection.BUY,
        fiatPayoutAmount: "5",
        payinNetwork: "polygon",
        payoutCurrency: "USDC",
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: "5 USDC to your wallet"
      },
      quote,
      quoteRequest,
      type: "START"
    });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));

    actor.send({ type: "RESET" });

    const snapshot = actor.getSnapshot();
    assert.equal(snapshot.value, "Idle");
    assert.equal(snapshot.context.quote, null);
    assert.equal(snapshot.context.additionalData, null);
    assert.equal(snapshot.context.meta, null);
    assert.equal(snapshot.context.ramp, null);
    assert.deepEqual(snapshot.context.userTxs, []);
    assert.equal(snapshot.context.lastStatus, null);
    assert.equal(snapshot.context.errorMessage, null);
    actor.stop();
  });

  it("registers with a refreshed quote", async () => {
    const refreshedQuote = {
      ...quote,
      id: "quote-refreshed",
      inputAmount: "101",
      inputCurrency: "MXN",
      outputAmount: "5.1",
      outputCurrency: "USDC"
    } as QuoteResponse;
    let registeredQuoteId: string | undefined;
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async () => ({ quote: refreshedQuote })),
        registerTransfer: fromPromise(async ({ input }) => {
          registeredQuoteId = input.quote.id;
          return { ramp, userTxs: [] as UnsignedTx[] };
        })
      }
    });
    const actor = createActor(machine).start();

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "MXN",
        corridorId: "MX",
        direction: RampDirection.BUY,
        fiatPayoutAmount: "5",
        payinNetwork: "polygon",
        payoutCurrency: "USDC",
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: "5 USDC to your wallet"
      },
      quote,
      quoteRequest,
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    assert.equal(registeredQuoteId, "quote-refreshed");
    assert.equal(actor.getSnapshot().context.quote?.id, "quote-refreshed");
    assert.equal(actor.getSnapshot().context.meta?.summary, "5.1 USDC to your wallet");
    actor.stop();
  });
});
