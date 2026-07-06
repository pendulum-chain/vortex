import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnyActorRef, createActor, fromCallback, fromPromise, setup, waitFor } from "xstate";

// The real module instantiates a Supabase client at import time, which fails in a node test environment.
vi.mock("../services/auth", () => ({
  AuthService: {
    getTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    storeTokens: vi.fn()
  }
}));

import { FiatToken, QuoteResponse, RampDirection, RampProcess } from "@vortexfi/shared";
import { ToastMessage } from "../helpers/notifications";
import { CheckEmailResponse, VerifyOTPResponse } from "../services/api/auth.api";
import { AuthService, type AuthTokens } from "../services/auth";
import { RampExecutionInput } from "../types/phases";
import { SignRampError, SignRampErrorType } from "./actors/sign.actor";
import { RampLimitExceededError } from "./actors/validateKyc.actor";
import { AlfredpayKycMachineError, AlfredpayKycMachineErrorType, alfredpayKycMachine } from "./alfredpayKyc.machine";
import { aveniaKycMachine } from "./brlaKyc.machine";
import { MykoboKycMachineError, MykoboKycMachineErrorType, mykoboKycMachine } from "./mykoboKyc.machine";
import { RampContext, RampMachineEvents, RampState } from "./types";
import { rampMachine } from "./ramp.machine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const quote = {
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  id: "quote-1",
  inputAmount: "100",
  outputAmount: "95",
  rampType: RampDirection.SELL
} as unknown as QuoteResponse;

const makeExecutionInput = (fiatToken: FiatToken): RampExecutionInput =>
  ({
    fiatToken,
    quote,
    sourceOrDestinationAddress: "0x2222222222222222222222222222222222222222"
  }) as unknown as RampExecutionInput;

const rampState = {
  quote,
  ramp: { id: "ramp-1", unsignedTxs: [] },
  requiredUserActionsCompleted: false,
  signedTransactions: []
} as unknown as RampState;

const authedTokens: AuthTokens = { accessToken: "at", refreshToken: "rt", userEmail: "user@example.com", userId: "user-1" };

// The fakes must declare the exact output types of the real actors (actor logic is invariant in its output).
type CheckTokenOutput = { success: boolean; tokens: null } | { success: boolean; tokens: AuthTokens };
type LoadQuoteOutput = { isExpired: boolean; quote: QuoteResponse };
type ValidateKycOutput = { kycNeeded: boolean; brlaEvmAddress?: string };

type ProvideArg = Parameters<typeof rampMachine.provide>[0];

function buildImplementations(actors?: ProvideArg["actors"], actions?: ProvideArg["actions"]): ProvideArg {
  return {
    actions: {
      // The real action waits 30 seconds; never useful in unit tests.
      refreshQuoteActionWithDelay: () => {},
      // The real action touches window.location.
      urlCleanerWithCallbackAction: () => {},
      ...actions
    },
    actors: {
      checkAndRefreshToken: fromPromise(async (): Promise<CheckTokenOutput> => ({ success: true, tokens: authedTokens })),
      checkEmail: fromPromise(async (): Promise<CheckEmailResponse> => ({ action: "signin", exists: true })),
      loadQuote: fromPromise(async (): Promise<LoadQuoteOutput> => ({ isExpired: false, quote })),
      quoteRefresher: fromCallback<RampMachineEvents, { context: RampContext }>(() => undefined),
      registerRamp: fromPromise(async () => rampState),
      requestOTP: fromPromise(async (): Promise<{ success: boolean }> => ({ success: true })),
      signTransactions: fromPromise(async () => rampState),
      startRamp: fromPromise(async () => ({ id: "ramp-1" }) as unknown as RampProcess),
      urlCleaner: fromPromise(async (): Promise<void> => undefined),
      validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: false })),
      verifyOTP: fromPromise(
        async (): Promise<VerifyOTPResponse> => ({ accessToken: "at", refreshToken: "rt", success: true, userId: "user-1" })
      ),
      ...actors
    }
  };
}

function createRampActor(actors?: ProvideArg["actors"], actions?: ProvideArg["actions"]) {
  return createActor(rampMachine.provide(buildImplementations(actors, actions)));
}

/** Minimal final child machine standing in for the Mykobo KYC machine. It finishes on FINISH. */
function stubMykoboMachine(output: { profileApproved?: boolean; error?: MykoboKycMachineError }) {
  return setup({}).createMachine({
    initial: "Waiting",
    output: () => output,
    states: { Done: { type: "final" }, Waiting: { on: { FINISH: "Done" } } }
  }) as unknown as typeof mykoboKycMachine;
}

/** Minimal child machine standing in for the Avenia KYC machine that completes immediately without error. */
const stubAveniaMachine = setup({}).createMachine({
  initial: "Done",
  output: () => ({}),
  states: { Done: { type: "final" } }
}) as unknown as typeof aveniaKycMachine;

/**
 * Minimal child machine standing in for the Alfredpay KYC machine. It captures
 * the input the ramp machine passes (country routing) and finishes on FINISH —
 * or on SummaryConfirm, to prove the parent forwards that event to this child.
 */
function stubAlfredpayMachine(output: { error?: AlfredpayKycMachineError } = {}) {
  return setup({}).createMachine({
    context: ({ input }) => ({ capturedInput: input as { country?: string; business?: boolean } }),
    initial: "Waiting",
    output: () => output,
    states: { Done: { type: "final" }, Waiting: { on: { FINISH: "Done", SummaryConfirm: "Done" } } }
  }) as unknown as typeof alfredpayKycMachine;
}

/** Waiting variant of the Avenia stub so the test can observe the {KYC: "Avenia"} state. */
function stubWaitingAveniaMachine(output: { error?: { message: string } } = {}) {
  return setup({}).createMachine({
    initial: "Waiting",
    output: () => output,
    states: { Done: { type: "final" }, Waiting: { on: { FINISH: "Done" } } }
  }) as unknown as typeof aveniaKycMachine;
}

async function goToQuoteReady(actor: ReturnType<typeof createRampActor>) {
  actor.send({ lock: false, quoteId: "quote-1", type: "SET_QUOTE" });
  await waitFor(actor, s => s.matches("QuoteReady"));
}

async function confirmRamp(actor: ReturnType<typeof createRampActor>, fiatToken = FiatToken.EURC, direction = RampDirection.SELL) {
  actor.send({
    input: { chainId: 1, executionInput: makeExecutionInput(fiatToken), rampDirection: direction },
    type: "CONFIRM"
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rampMachine", () => {
  describe("quote loading and auth", () => {
    it("starts in Idle with the initial context", () => {
      const actor = createRampActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe("Idle");
      expect(actor.getSnapshot().context.isAuthenticated).toBe(false);
      expect(actor.getSnapshot().context.quote).toBeUndefined();
    });

    it("loads a quote and lands in QuoteReady when the session is valid", async () => {
      const load = deferred<{ isExpired: boolean; quote: QuoteResponse }>();
      const actor = createRampActor({ loadQuote: fromPromise(() => load.promise) });
      actor.start();

      actor.send({ lock: true, quoteId: "quote-1", type: "SET_QUOTE" });
      expect(actor.getSnapshot().value).toBe("LoadingQuote");
      expect(actor.getSnapshot().context.quoteId).toBe("quote-1");
      expect(actor.getSnapshot().context.quoteLocked).toBe(true);

      load.resolve({ isExpired: false, quote });
      await waitFor(actor, s => s.matches("QuoteReady"));

      const context = actor.getSnapshot().context;
      expect(context.quote).toEqual(quote);
      expect(context.isAuthenticated).toBe(true);
      expect(context.userEmail).toBe("user@example.com");
      expect(context.userId).toBe("user-1");
      // PostAuthRouting clears the routing target on exit.
      expect(context.postAuthTarget).toBeUndefined();
    });

    it("returns to Idle with an expired-quote flag when loading the quote fails", async () => {
      const actor = createRampActor({
        loadQuote: fromPromise(async (): Promise<LoadQuoteOutput> => {
          throw new Error("quote not found");
        })
      });
      actor.start();

      actor.send({ lock: false, quoteId: "missing", type: "SET_QUOTE" });
      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.isQuoteExpired).toBe(true);
      expect(actor.getSnapshot().context.quote).toBeUndefined();
    });

    it("walks the email/OTP login flow and stores the tokens", async () => {
      const actor = createRampActor({
        checkAndRefreshToken: fromPromise(async (): Promise<CheckTokenOutput> => ({ success: false, tokens: null }))
      });
      actor.start();

      actor.send({ lock: false, quoteId: "quote-1", type: "SET_QUOTE" });
      await waitFor(actor, s => s.matches("EnterEmail"));

      actor.send({ email: "new@user.com", type: "ENTER_EMAIL" });
      expect(actor.getSnapshot().value).toBe("CheckingEmail");
      expect(actor.getSnapshot().context.userEmail).toBe("new@user.com");

      await waitFor(actor, s => s.matches("EnterOTP"));

      actor.send({ code: "123456", type: "VERIFY_OTP" });
      expect(actor.getSnapshot().value).toBe("VerifyingOTP");

      await waitFor(actor, s => s.matches("QuoteReady"));
      expect(actor.getSnapshot().context.isAuthenticated).toBe(true);
      expect(actor.getSnapshot().context.userId).toBe("user-1");
      expect(AuthService.storeTokens).toHaveBeenCalledWith({
        accessToken: "at",
        refreshToken: "rt",
        userEmail: "new@user.com",
        userId: "user-1"
      });
    });

    it("an invalid OTP returns to EnterOTP with an error message", async () => {
      const actor = createRampActor({
        checkAndRefreshToken: fromPromise(async (): Promise<CheckTokenOutput> => ({ success: false, tokens: null })),
        verifyOTP: fromPromise(async (): Promise<VerifyOTPResponse> => {
          throw new Error("invalid code");
        })
      });
      actor.start();
      actor.send({ lock: false, quoteId: "quote-1", type: "SET_QUOTE" });
      await waitFor(actor, s => s.matches("EnterEmail"));
      actor.send({ email: "new@user.com", type: "ENTER_EMAIL" });
      await waitFor(actor, s => s.matches("EnterOTP"));

      actor.send({ code: "000000", type: "VERIFY_OTP" });
      await waitFor(actor, s => s.matches("EnterOTP") && s.context.errorMessage !== undefined);
      expect(actor.getSnapshot().context.errorMessage).toBe("Invalid OTP code. Please try again.");
    });

    it("a failed OTP request returns to EnterEmail with an error message", async () => {
      const actor = createRampActor({
        checkAndRefreshToken: fromPromise(async (): Promise<CheckTokenOutput> => ({ success: false, tokens: null })),
        requestOTP: fromPromise(async (): Promise<{ success: boolean }> => {
          throw new Error("mail service down");
        })
      });
      actor.start();
      actor.send({ lock: false, quoteId: "quote-1", type: "SET_QUOTE" });
      await waitFor(actor, s => s.matches("EnterEmail"));

      actor.send({ email: "new@user.com", type: "ENTER_EMAIL" });
      await waitFor(actor, s => s.matches("EnterEmail") && s.context.errorMessage !== undefined);
      expect(actor.getSnapshot().context.errorMessage).toBe("Failed to send OTP. Please try again.");
    });

    it("a failed email check returns to EnterEmail with an error message", async () => {
      const actor = createRampActor({
        checkAndRefreshToken: fromPromise(async (): Promise<CheckTokenOutput> => ({ success: false, tokens: null })),
        checkEmail: fromPromise(async (): Promise<CheckEmailResponse> => {
          throw new Error("email check down");
        })
      });
      actor.start();
      actor.send({ lock: false, quoteId: "quote-1", type: "SET_QUOTE" });
      await waitFor(actor, s => s.matches("EnterEmail"));

      actor.send({ email: "new@user.com", type: "ENTER_EMAIL" });
      await waitFor(actor, s => s.matches("EnterEmail") && s.context.errorMessage !== undefined);
      expect(actor.getSnapshot().context.errorMessage).toBe("Failed to check email. Please try again.");
    });
  });

  describe("ramp execution", () => {
    it("runs a SELL ramp from CONFIRM through signing to RampFollowUp", async () => {
      const register = deferred<RampState>();
      const sign = deferred<RampState>();
      const actor = createRampActor({
        registerRamp: fromPromise(() => register.promise),
        signTransactions: fromPromise(() => sign.promise)
      });
      actor.start();
      await goToQuoteReady(actor);

      await confirmRamp(actor);
      expect(actor.getSnapshot().value).toBe("RampRequested");
      expect(actor.getSnapshot().context.chainId).toBe(1);
      expect(actor.getSnapshot().context.rampDirection).toBe(RampDirection.SELL);

      // NOTE: with kycNeeded=false and a non-BRL token, no RampRequested.onDone branch matches, so the
      // machine intentionally stays in RampRequested until the user confirms the summary modal.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(actor.getSnapshot().value).toBe("RampRequested");

      actor.send({ type: "SummaryConfirm" });
      expect(actor.getSnapshot().value).toBe("RegisterRamp");
      expect(actor.getSnapshot().context.quoteLocked).toBe(true);

      register.resolve(rampState);
      await waitFor(actor, s => s.matches("UpdateRamp"));
      expect(actor.getSnapshot().context.rampState).toEqual(rampState);

      sign.resolve(rampState);
      await waitFor(actor, s => s.matches("RampFollowUp"));

      actor.send({ type: "FINISH_OFFRAMPING" });
      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.quote).toBeUndefined();
    });

    it("a BUY ramp stays in UpdateRamp after signing until the payment is confirmed", async () => {
      const signedState = { ...rampState, signedTransactions: [{}] } as unknown as RampState;
      const actor = createRampActor({
        signTransactions: fromPromise(async () => signedState)
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.EURC, RampDirection.BUY);
      actor.send({ type: "SummaryConfirm" });

      await waitFor(actor, s => s.matches("UpdateRamp") && s.context.rampState?.signedTransactions.length === 1);
      expect(actor.getSnapshot().value).toBe("UpdateRamp");

      actor.send({ type: "PAYMENT_CONFIRMED" });
      expect(actor.getSnapshot().context.rampPaymentConfirmed).toBe(true);
      await waitFor(actor, s => s.matches("RampFollowUp"));
    });

    it("a user-rejected signature emits a toast and resets the ramp", async () => {
      const actor = createRampActor({
        signTransactions: fromPromise(async (): Promise<RampState> => {
          throw new SignRampError("User rejected", SignRampErrorType.UserRejected);
        })
      });
      const toasts: ToastMessage[] = [];
      actor.on("SHOW_ERROR_TOAST", event => toasts.push(event.message));
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);
      actor.send({ type: "SummaryConfirm" });

      await waitFor(actor, s => s.matches("Idle"));
      expect(toasts).toEqual([ToastMessage.SIGNING_REJECTED]);
      expect(actor.getSnapshot().context.quote).toBeUndefined();
      expect(actor.getSnapshot().context.errorMessage).toBeUndefined();
    });

    it("a generic signing failure lands in Error with the message and can be reset", async () => {
      const actor = createRampActor({
        signTransactions: fromPromise(async (): Promise<RampState> => {
          throw new Error("insufficient funds for gas");
        })
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);
      actor.send({ type: "SummaryConfirm" });

      await waitFor(actor, s => s.matches("Error"));
      const context = actor.getSnapshot().context;
      expect(context.errorMessage).toBe("insufficient funds for gas");
      expect(context.rampSigningPhase).toBeUndefined();

      actor.send({ type: "RESET_RAMP" });
      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.quote).toBeUndefined();
    });

    it("a registration failure lands in Error with the message", async () => {
      const actor = createRampActor({
        registerRamp: fromPromise(async (): Promise<RampState> => {
          throw new Error("registration failed");
        })
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);
      actor.send({ type: "SummaryConfirm" });

      await waitFor(actor, s => s.matches("Error"));
      expect(actor.getSnapshot().context.errorMessage).toBe("registration failed");
    });

    it("a KYC validation failure returns to Idle", async () => {
      const actor = createRampActor({
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => {
          throw new Error("validation error");
        })
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);

      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.initializeFailedMessage).toBeUndefined();
    });

    it("an exceeded ramp limit returns to Idle with the limit error message", async () => {
      const actor = createRampActor({
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => {
          throw new RampLimitExceededError();
        })
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.BRL);

      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.initializeFailedMessage).toBe("Insufficient remaining limit for this transaction.");
    });

    it("redirects to the callback URL after starting a ramp and returns to Idle after the delay", async () => {
      vi.useFakeTimers();
      try {
        const callbackAction = vi.fn();
        const actor = createRampActor(undefined, { urlCleanerWithCallbackAction: callbackAction });
        actor.start();

        actor.send({ callbackUrl: "https://partner.example/callback", type: "SET_QUOTE_PARAMS" });
        await goToQuoteReady(actor);
        await confirmRamp(actor);
        actor.send({ type: "SummaryConfirm" });

        await waitFor(actor, s => s.matches("RedirectCallback"));

        vi.advanceTimersByTime(5000);
        expect(actor.getSnapshot().value).toBe("Idle");
        expect(callbackAction).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("KYC routing", () => {
    it("routes EURC ramps with kycNeeded to the Mykobo child and advances to KycComplete on approval", async () => {
      const actor = createRampActor({
        mykoboKyc: stubMykoboMachine({ profileApproved: true }),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);

      await waitFor(actor, s => s.matches({ KYC: "Mykobo" }));

      (actor.getSnapshot().children.mykoboKyc as AnyActorRef).send({ type: "FINISH" });
      await waitFor(actor, s => s.matches("KycComplete"));
    });

    it("returns to QuoteReady when the user cancels Mykobo KYC", async () => {
      const actor = createRampActor({
        mykoboKyc: stubMykoboMachine({
          error: new MykoboKycMachineError("Cancelled by the user", MykoboKycMachineErrorType.UserRejected)
        }),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);
      await waitFor(actor, s => s.matches({ KYC: "Mykobo" }));

      (actor.getSnapshot().children.mykoboKyc as AnyActorRef).send({ type: "FINISH" });
      await waitFor(actor, s => s.matches("QuoteReady"));
    });

    it("a KYC rejection resets the ramp but keeps the failure message", async () => {
      const actor = createRampActor({
        mykoboKyc: stubMykoboMachine({
          error: new MykoboKycMachineError("KYC was rejected", MykoboKycMachineErrorType.KycRejected)
        }),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor);
      await waitFor(actor, s => s.matches({ KYC: "Mykobo" }));

      (actor.getSnapshot().children.mykoboKyc as AnyActorRef).send({ type: "FINISH" });
      // KycFailure immediately resets; the reset preserves initializeFailedMessage for the UI.
      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.initializeFailedMessage).toBe("KYC was rejected");
    });

    it("BRL ramps with a valid KYC go straight to KycComplete", async () => {
      const actor = createRampActor({
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: false }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.BRL);

      await waitFor(actor, s => s.matches("KycComplete"));
    });

    it("PROCEED_TO_REGISTRATION from KycComplete stores the fiat account and registers directly when authenticated", async () => {
      const actor = createRampActor({
        registerRamp: fromPromise(() => new Promise<RampState>(() => {})),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: false }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.BRL);
      await waitFor(actor, s => s.matches("KycComplete"));

      actor.send({ selectedFiatAccountId: "fiat-account-1", type: "PROCEED_TO_REGISTRATION" });
      expect(actor.getSnapshot().value).toBe("RegisterRamp");
      expect(actor.getSnapshot().context.executionInput?.selectedFiatAccountId).toBe("fiat-account-1");
    });

    it.each([
      [FiatToken.MXN, "MX"],
      [FiatToken.USD, "US"],
      [FiatToken.COP, "CO"],
      [FiatToken.ARS, "AR"]
    ])("routes %s ramps with kycNeeded to the Alfredpay child with country %s and completes", async (fiatToken, country) => {
      const actor = createRampActor({
        alfredpayKyc: stubAlfredpayMachine(),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, fiatToken);

      await waitFor(actor, s => s.matches({ KYC: "Alfredpay" }));

      // The parent derived the Alfredpay country from the quote's fiat token.
      const child = actor.getSnapshot().children.alfredpayKyc as AnyActorRef;
      const capturedInput = child.getSnapshot().context.capturedInput as { country?: string; business?: boolean };
      expect(capturedInput.country).toBe(country);
      expect(capturedInput.business).toBeUndefined();

      child.send({ type: "FINISH" });
      await waitFor(actor, s => s.matches("KycComplete"));
    });

    it("an Alfredpay KYC error output resets the ramp but keeps the failure message", async () => {
      const actor = createRampActor({
        alfredpayKyc: stubAlfredpayMachine({
          error: new AlfredpayKycMachineError("Verification rejected", AlfredpayKycMachineErrorType.UnknownError)
        }),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.MXN);
      await waitFor(actor, s => s.matches({ KYC: "Alfredpay" }));

      (actor.getSnapshot().children.alfredpayKyc as AnyActorRef).send({ type: "FINISH" });
      // KycFailure immediately resets; the reset preserves initializeFailedMessage for the UI.
      await waitFor(actor, s => s.matches("Idle"));
      expect(actor.getSnapshot().context.initializeFailedMessage).toBe("Verification rejected");
    });

    it("SummaryConfirm inside KYC is forwarded to the Alfredpay child", async () => {
      const actor = createRampActor({
        alfredpayKyc: stubAlfredpayMachine(),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.ARS);
      await waitFor(actor, s => s.matches({ KYC: "Alfredpay" }));

      // The stub finalizes when it receives the forwarded SummaryConfirm.
      actor.send({ type: "SummaryConfirm" });
      await waitFor(actor, s => s.matches("KycComplete"));
    });

    it("routes BRL ramps with kycNeeded to the Avenia child and advances to KycComplete on success", async () => {
      const actor = createRampActor({
        aveniaKyc: stubWaitingAveniaMachine(),
        validateKyc: fromPromise(async (): Promise<ValidateKycOutput> => ({ kycNeeded: true }))
      });
      actor.start();
      await goToQuoteReady(actor);
      await confirmRamp(actor, FiatToken.BRL);

      await waitFor(actor, s => s.matches({ KYC: "Avenia" }));

      (actor.getSnapshot().children.aveniaKyc as AnyActorRef).send({ type: "FINISH" });
      await waitFor(actor, s => s.matches("KycComplete"));
    });

    it("completes the quote-less KYB deep link via SelectRegion and lands in KybLinkComplete", async () => {
      const actor = createRampActor({ aveniaKyc: stubAveniaMachine });
      actor.start();

      actor.send({ type: "START_KYB_LINK" });
      await waitFor(actor, s => s.matches("SelectRegion"));
      expect(actor.getSnapshot().context.kybLink).toEqual({ fiatToken: undefined, regionLocked: false });

      actor.send({ fiatToken: FiatToken.BRL, type: "SELECT_REGION" });
      await waitFor(actor, s => s.matches("KybLinkComplete"));
    });
  });

  describe("global events", () => {
    it("updates the connected wallet address from anywhere", () => {
      const actor = createRampActor();
      actor.start();
      actor.send({ address: "0x3333333333333333333333333333333333333333", type: "SET_ADDRESS" });
      expect(actor.getSnapshot().context.connectedWalletAddress).toBe("0x3333333333333333333333333333333333333333");
    });

    it("EXPIRE_QUOTE marks the quote expired unless the quote is locked", async () => {
      const actor = createRampActor();
      actor.start();
      actor.send({ type: "EXPIRE_QUOTE" });
      expect(actor.getSnapshot().context.isQuoteExpired).toBe(true);

      const lockedActor = createRampActor();
      lockedActor.start();
      lockedActor.send({ lock: true, quoteId: "quote-1", type: "SET_QUOTE" });
      await waitFor(lockedActor, s => s.matches("QuoteReady"));
      lockedActor.send({ type: "EXPIRE_QUOTE" });
      expect(lockedActor.getSnapshot().context.isQuoteExpired).toBe(false);
    });

    it("LOGOUT clears the session and moves to EnterEmail", async () => {
      const actor = createRampActor();
      actor.start();
      await goToQuoteReady(actor);
      expect(actor.getSnapshot().context.isAuthenticated).toBe(true);

      actor.send({ type: "LOGOUT" });
      expect(actor.getSnapshot().value).toBe("EnterEmail");
      expect(actor.getSnapshot().context.isAuthenticated).toBe(false);
      expect(actor.getSnapshot().context.userEmail).toBeUndefined();
    });

    it("SIGNING_UPDATE keeps previous progress values when the event omits them", () => {
      const actor = createRampActor();
      actor.start();

      actor.send({ current: 1, max: 4, phase: "started", type: "SIGNING_UPDATE" });
      actor.send({ phase: "signed", type: "SIGNING_UPDATE" });

      const context = actor.getSnapshot().context;
      expect(context.rampSigningPhase).toBe("signed");
      expect(context.rampSigningPhaseCurrent).toBe(1);
      expect(context.rampSigningPhaseMax).toBe(4);
    });
  });
});
