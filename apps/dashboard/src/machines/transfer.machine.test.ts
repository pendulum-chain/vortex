import {
  EvmToken,
  Networks,
  type QuoteResponse,
  RampDirection,
  type RampProcess,
  type UnsignedTx
} from "@vortexfi/shared";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActor, fromPromise, waitFor } from "xstate";
import type { TransferQuoteRequest, UserTxSubmission } from "./transfer.actors";

const WALLET_TX_HASH = `0x${"cd".repeat(32)}`;
let broadcasts = 0;
mock.module("@/services/transactions/userSigning", () => ({
  signAndSubmitEvmTransaction: async () => {
    broadcasts += 1;
    return WALLET_TX_HASH;
  },
  signMultipleTypedData: () => {
    throw new Error("Unexpected wallet signing in transfer machine test");
  }
}));

const { transferMachine } = await import("./transfer.machine");

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

describe("transferMachine", () => {
  it("blocks owner activation only during quote, balance, registration, user signing, and its submission", async () => {
    let releaseQuote: (() => void) | undefined;
    let releaseBalance: (() => void) | undefined;
    let releaseRegistration: (() => void) | undefined;
    let releaseSigning: (() => void) | undefined;
    let releaseSubmission: (() => void) | undefined;
    let releaseStart: (() => void) | undefined;
    const sellQuote = { ...quote, rampType: RampDirection.SELL } as QuoteResponse;
    const sellRamp = { ...ramp, type: RampDirection.SELL } as RampProcess;
    const machine = transferMachine.provide({
      actors: {
        checkTransferBalance: fromPromise(
          () => new Promise<void>(resolve => (releaseBalance = resolve))
        ),
        refreshTransferQuote: fromPromise(
          () => new Promise<{ quote: QuoteResponse }>(resolve => (releaseQuote = () => resolve({ quote: sellQuote })))
        ),
        registerTransfer: fromPromise(
          () =>
            new Promise<{ ramp: RampProcess; userTxs: UnsignedTx[] }>(resolve =>
              (releaseRegistration = () => resolve({ ramp: sellRamp, userTxs: [] }))
            )
        ),
        signUserTransactions: fromPromise(
          () =>
            new Promise<UserTxSubmission>(resolve => (releaseSigning = () => resolve({ additionalData: {}, signedTxs: [] })))
        ),
        startRamp: fromPromise(() => new Promise<RampProcess>(resolve => (releaseStart = () => resolve(sellRamp)))),
        submitUserTxs: fromPromise(() => new Promise<RampProcess>(resolve => (releaseSubmission = () => resolve(sellRamp)))),
        trackRamp: fromPromise(async () => undefined) as never
      }
    });
    const actor = createActor(machine).start();
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });
    actor.send({
      additionalData: { walletAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "USDC",
        corridorId: "MX",
        direction: RampDirection.SELL,
        fiatPayoutAmount: "5",
        ownerProfileId: "profile-1",
        payinNetwork: "polygon",
        payoutCurrency: "MXN",
        recipientEmail: "recipient@example.com",
        recipientId: "recipient-1",
        summary: "5 MXN to recipient@example.com"
      },
      ownerProfileId: "profile-1",
      quote: sellQuote,
      quoteRequest: { ...quoteRequest, params: { ...quoteRequest.params, direction: RampDirection.SELL } },
      type: "START"
    });

    for (const [state, release] of [
      ["CheckingQuote", () => releaseQuote?.()],
      ["CheckingBalance", () => releaseBalance?.()],
      ["Registering", () => releaseRegistration?.()],
      ["SigningUserTxs", () => releaseSigning?.()],
      ["SubmittingUserTxs", () => releaseSubmission?.()]
    ] as const) {
      await waitFor(actor, snapshot => snapshot.matches(state));
      actor.send({ ownerProfileId: "profile-2", recovery: null, type: "ACTIVATE_OWNER" });
      assert.equal(actor.getSnapshot().context.activeOwnerProfileId, "profile-1");
      assert.equal(actor.getSnapshot().value, state);
      release();
    }

    await waitFor(actor, snapshot => snapshot.matches("Starting"));
    actor.send({ ownerProfileId: "profile-2", recovery: null, type: "ACTIVATE_OWNER" });
    assert.equal(actor.getSnapshot().context.activeOwnerProfileId, "profile-2");
    assert.equal(actor.getSnapshot().value, "Idle");
    releaseStart?.();
    actor.stop();
  });

  it("rejects transfer and payment events from a different owner", async () => {
    let startCalls = 0;
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
        registerTransfer: fromPromise(async () => ({ ramp, userTxs: [] as UnsignedTx[] })),
        startRamp: fromPromise(async () => {
          startCalls += 1;
          return ramp;
        })
      }
    });
    const actor = createActor(machine).start();
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    const meta = {
      accountId: "account-1",
      amountIn: "100",
      amountInToken: "MXN",
      corridorId: "MX" as const,
      direction: RampDirection.BUY,
      fiatPayoutAmount: "5",
      ownerProfileId: "profile-1",
      payinNetwork: "polygon",
      payoutCurrency: "USDC",
      recipientEmail: "Your wallet",
      recipientId: "",
      summary: "5 USDC to your wallet"
    };
    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta,
      ownerProfileId: "profile-2",
      quote,
      quoteRequest,
      type: "START"
    });
    assert.equal(actor.getSnapshot().value, "Idle");

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta,
      ownerProfileId: "profile-1",
      quote,
      quoteRequest,
      type: "START"
    });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    actor.send({ ownerProfileId: "profile-2", type: "PAYMENT_CONFIRMED" });
    assert.equal(actor.getSnapshot().value, "AwaitingPayment");
    assert.equal(startCalls, 0);
    actor.stop();
  });

  it("signs the wallet-owned onramp transactions before showing payment instructions", async () => {
    const eurRamp = { id: "ramp-eur", inputCurrency: "EUR", type: RampDirection.BUY } as RampProcess;
    const permit = { nonce: 0, phase: "moneriumOnrampSelfTransfer", signer: "0x1111111111111111111111111111111111111111" } as UnsignedTx;
    let signed = 0;
    let startCalls = 0;
    const machine = transferMachine.provide({
      actors: {
        refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
        registerTransfer: fromPromise(async () => ({ ramp: eurRamp, userTxs: [permit] })),
        signUserTransactions: fromPromise(async ({ input }) => {
          signed += input.userTxs.length;
          return { additionalData: {}, signedTxs: [] };
        }),
        startRamp: fromPromise(async () => {
          startCalls += 1;
          return eurRamp;
        }),
        submitUserTxs: fromPromise(
          async () =>
            ({ ...eurRamp, ibanPaymentData: { bic: "MONEEE00", iban: "EE52", receiverName: "Monerium" } }) as RampProcess
        )
      }
    });
    const actor = createActor(machine).start();
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });
    actor.send({
      additionalData: {
        destinationAddress: "0x1111111111111111111111111111111111111111",
        walletAddress: "0x1111111111111111111111111111111111111111"
      },
      meta: {
        accountId: "account-1",
        amountIn: "100",
        amountInToken: "EUR",
        corridorId: "EU" as const,
        direction: RampDirection.BUY,
        fiatPayoutAmount: "107",
        ownerProfileId: "profile-1",
        payinNetwork: "polygon",
        payoutCurrency: "USDC",
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: "107 USDC to your wallet"
      },
      ownerProfileId: "profile-1",
      quote: { ...quote, id: "quote-eur" } as QuoteResponse,
      quoteRequest: { ...quoteRequest, params: { ...quoteRequest.params, corridorId: "EU" as const } },
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    assert.equal(signed, 1);
    assert.equal(startCalls, 0);
    assert.equal(actor.getSnapshot().context.ramp?.ibanPaymentData?.iban, "EE52");
    actor.stop();
  });

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
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        ownerProfileId: "profile-1",
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
      ownerProfileId: "profile-1",
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    assert.equal(startCalls, 0);
    assert.equal(actor.getSnapshot().context.ramp?.achPaymentData?.clabe, "646180157000000004");

    actor.send({ ownerProfileId: "profile-1", type: "PAYMENT_CONFIRMED" });
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
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        ownerProfileId: "profile-1",
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
      ownerProfileId: "profile-1",
      type: "START"
    });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));

    actor.send({ ownerProfileId: "profile-1", type: "PAYMENT_CONFIRMED" });
    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment") && snapshot.context.errorMessage !== null);
    const failed = actor.getSnapshot();
    assert.equal(startCalls, 1);
    assert.equal(failed.context.errorMessage, "network blip");
    assert.equal(failed.context.ramp?.id, "ramp-buy");

    actor.send({ ownerProfileId: "profile-1", type: "PAYMENT_CONFIRMED" });
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
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        ownerProfileId: "profile-1",
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
      ownerProfileId: "profile-1",
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
    assert.equal(snapshot.context.activeOwnerProfileId, "profile-1");
    actor.stop();
  });

  it("preserves the active owner when resetting terminal states", async () => {
    for (const terminalState of ["Done", "Failed"] as const) {
      const machine = transferMachine.provide({
        actors: {
          refreshTransferQuote: fromPromise(async ({ input }) => {
            if (terminalState === "Failed") throw new Error("quote failed");
            return { quote: input.quote };
          }),
          registerTransfer: fromPromise(async () => ({ ramp, userTxs: [] as UnsignedTx[] })),
          startRamp: fromPromise(async () => ramp),
          trackRamp: fromPromise(async () => undefined) as never
        }
      });
      const actor = createActor(machine).start();
      actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });
      actor.send({
        additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
        meta: {
          accountId: "account-1",
          amountIn: "100",
          amountInToken: "MXN",
          corridorId: "MX",
          direction: RampDirection.BUY,
          fiatPayoutAmount: "5",
          ownerProfileId: "profile-1",
          payinNetwork: "polygon",
          payoutCurrency: "USDC",
          recipientEmail: "Your wallet",
          recipientId: "",
          summary: "5 USDC to your wallet"
        },
        ownerProfileId: "profile-1",
        quote,
        quoteRequest,
        type: "START"
      });

      if (terminalState === "Done") {
        await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
        actor.send({ ownerProfileId: "profile-1", type: "PAYMENT_CONFIRMED" });
        await waitFor(actor, snapshot => snapshot.matches("Tracking"));
        actor.send({ status: { currentPhase: "complete" } as never, type: "TERMINAL" });
      }
      await waitFor(actor, snapshot => snapshot.matches(terminalState));
      actor.send({ type: "RESET" });

      assert.equal(actor.getSnapshot().value, "Idle");
      assert.equal(actor.getSnapshot().context.activeOwnerProfileId, "profile-1");
      actor.stop();
    }
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
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    actor.send({
      additionalData: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        ownerProfileId: "profile-1",
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
      ownerProfileId: "profile-1",
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("AwaitingPayment"));
    assert.equal(registeredQuoteId, "quote-refreshed");
    assert.equal(actor.getSnapshot().context.quote?.id, "quote-refreshed");
    assert.equal(actor.getSnapshot().context.meta?.summary, "5.1 USDC to your wallet");
    actor.stop();
  });

  it("does not register an offramp when the balance check fails", async () => {
    const sellQuote = {
      id: "quote-sell",
      inputAmount: "54.054054",
      inputCurrency: "USDC",
      network: Networks.Polygon,
      outputAmount: "1000",
      outputCurrency: "MXN",
      rampType: RampDirection.SELL
    } as QuoteResponse;
    const sellQuoteRequest: TransferQuoteRequest = {
      kind: "input",
      params: {
        corridorId: "MX",
        direction: RampDirection.SELL,
        inputAmount: sellQuote.inputAmount,
        network: Networks.Polygon,
        token: EvmToken.USDC
      }
    };
    let registerCalls = 0;
    const machine = transferMachine.provide({
      actors: {
        checkTransferBalance: fromPromise(async (): Promise<void> => {
          throw new Error("Insufficient USDC balance on Polygon");
        }),
        refreshTransferQuote: fromPromise(async () => ({ quote: sellQuote })),
        registerTransfer: fromPromise(async () => {
          registerCalls += 1;
          return { ramp, userTxs: [] as UnsignedTx[] };
        })
      }
    });
    const actor = createActor(machine).start();
    actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" });

    actor.send({
      additionalData: { walletAddress: "0x1111111111111111111111111111111111111111" },
      meta: {
        accountId: "account-1",
        ownerProfileId: "profile-1",
        amountIn: sellQuote.inputAmount,
        amountInToken: "USDC",
        corridorId: "MX",
        direction: RampDirection.SELL,
        fiatPayoutAmount: sellQuote.outputAmount,
        payinNetwork: Networks.Polygon,
        payoutCurrency: "MXN",
        recipientEmail: "recipient@example.com",
        recipientId: "recipient-1",
        summary: "1000 MXN to recipient@example.com"
      },
      quote: sellQuote,
      quoteRequest: sellQuoteRequest,
      ownerProfileId: "profile-1",
      type: "START"
    });

    await waitFor(actor, snapshot => snapshot.matches("Failed"));
    assert.equal(actor.getSnapshot().context.errorMessage, "Insufficient USDC balance on Polygon");
    assert.equal(registerCalls, 0);
    actor.stop();
  });

  describe("offramp after the wallet broadcast", () => {
    const wallet = "0x1111111111111111111111111111111111111111";
    const sellQuote = { id: "quote-sell", rampType: RampDirection.SELL } as QuoteResponse;
    const sellRamp = { expiresAt: "2026-10-05T12:15:00.000Z", id: "ramp-sell", type: RampDirection.SELL } as RampProcess;
    const walletTx = {
      network: Networks.Polygon,
      nonce: 0,
      phase: "squidRouterNoPermitTransfer",
      signer: wallet,
      txData: { data: "0x", gas: "21000", to: "0x2222222222222222222222222222222222222222", value: "0" }
    } as unknown as UnsignedTx;
    const sellMeta = {
      accountId: "account-1",
      amountIn: "100",
      amountInToken: "USDC",
      corridorId: "MX" as const,
      direction: RampDirection.SELL,
      fiatPayoutAmount: "1850",
      ownerProfileId: "profile-1",
      payinNetwork: "polygon",
      payoutCurrency: "MXN",
      recipientEmail: "recipient@example.com",
      recipientId: "recipient-1",
      summary: "1850 MXN to recipient@example.com"
    };
    const maintenance = "Vortex services are temporarily unavailable during scheduled maintenance";

    function sellMachine(calls: { submissions: UserTxSubmission[]; starts: number }, fail: { submit?: number; start?: number }) {
      return transferMachine.provide({
        actors: {
          checkTransferBalance: fromPromise(async (): Promise<void> => undefined),
          refreshTransferQuote: fromPromise(async ({ input }) => ({ quote: input.quote })),
          registerTransfer: fromPromise(async () => ({ ramp: sellRamp, userTxs: [walletTx] })),
          startRamp: fromPromise(async () => {
            calls.starts += 1;
            if (calls.starts <= (fail.start ?? 0)) throw new Error(maintenance);
            return sellRamp;
          }),
          submitUserTxs: fromPromise(async ({ input }) => {
            calls.submissions.push(input.submission);
            if (calls.submissions.length <= (fail.submit ?? 0)) throw new Error(maintenance);
            return sellRamp;
          }),
          trackRamp: fromPromise(async () => undefined) as never
        }
      });
    }

    function startSell(actor: { send: (event: never) => void }) {
      actor.send({ ownerProfileId: "profile-1", recovery: null, type: "ACTIVATE_OWNER" } as never);
      actor.send({
        additionalData: { walletAddress: wallet },
        meta: sellMeta,
        ownerProfileId: "profile-1",
        quote: sellQuote,
        quoteRequest: { ...quoteRequest, params: { ...quoteRequest.params, direction: RampDirection.SELL } },
        type: "START"
      } as never);
    }

    it("keeps the ramp and broadcast hash when the final update fails, and resends it without re-broadcasting", async () => {
      broadcasts = 0;
      const calls = { starts: 0, submissions: [] as UserTxSubmission[] };
      const actor = createActor(sellMachine(calls, { submit: 1 })).start();
      startSell(actor);

      await waitFor(actor, snapshot => snapshot.matches("AwaitingRetry"));
      const failed = actor.getSnapshot().context;
      assert.equal(broadcasts, 1);
      assert.equal(calls.starts, 0);
      assert.equal(failed.errorMessage, maintenance);
      assert.equal(failed.ramp?.id, "ramp-sell");
      assert.equal(failed.ramp?.expiresAt, "2026-10-05T12:15:00.000Z");
      assert.equal(failed.userTxSubmission?.additionalData.squidRouterNoPermitTransferHash, WALLET_TX_HASH);

      actor.send({ ownerProfileId: "profile-2", type: "RETRY" });
      assert.equal(actor.getSnapshot().value, "AwaitingRetry");

      actor.send({ ownerProfileId: "profile-1", type: "RETRY" });
      await waitFor(actor, snapshot => snapshot.matches("Tracking"));
      assert.equal(broadcasts, 1);
      assert.equal(calls.submissions.length, 2);
      assert.deepEqual(calls.submissions[1], calls.submissions[0]);
      assert.equal(calls.starts, 1);
      assert.equal(actor.getSnapshot().context.userTxSubmission, null);
      assert.equal(actor.getSnapshot().context.errorMessage, null);
      actor.stop();
    });

    it("retries only the start once the update went through", async () => {
      broadcasts = 0;
      const calls = { starts: 0, submissions: [] as UserTxSubmission[] };
      const actor = createActor(sellMachine(calls, { start: 1 })).start();
      startSell(actor);

      await waitFor(actor, snapshot => snapshot.matches("AwaitingRetry"));
      assert.equal(actor.getSnapshot().context.errorMessage, maintenance);
      assert.equal(actor.getSnapshot().context.userTxSubmission, null);
      assert.equal(actor.getSnapshot().context.ramp?.id, "ramp-sell");

      actor.send({ ownerProfileId: "profile-1", type: "RETRY" });
      await waitFor(actor, snapshot => snapshot.matches("Tracking"));
      assert.equal(broadcasts, 1);
      assert.equal(calls.submissions.length, 1);
      assert.equal(calls.starts, 2);
      actor.stop();
    });

    it("resumes a restored offramp at the update it still owes, without the wallet", async () => {
      broadcasts = 0;
      const calls = { starts: 0, submissions: [] as UserTxSubmission[] };
      const submission: UserTxSubmission = {
        additionalData: { squidRouterNoPermitTransferHash: WALLET_TX_HASH },
        signedTxs: []
      };
      const actor = createActor(sellMachine(calls, {})).start();
      actor.send({
        ownerProfileId: "profile-1",
        recovery: {
          activeOwnerProfileId: "profile-1",
          additionalData: null,
          errorMessage: null,
          lastStatus: null,
          meta: sellMeta,
          quote: sellQuote,
          quoteRequest: null,
          ramp: sellRamp,
          userTxSubmission: submission,
          userTxs: []
        },
        type: "ACTIVATE_OWNER"
      });
      assert.equal(actor.getSnapshot().value, "AwaitingRetry");

      actor.send({ ownerProfileId: "profile-1", type: "RETRY" });
      await waitFor(actor, snapshot => snapshot.matches("Tracking"));
      assert.equal(broadcasts, 0);
      assert.deepEqual(calls.submissions, [submission]);
      assert.equal(calls.starts, 1);
      actor.stop();
    });
  });
});
