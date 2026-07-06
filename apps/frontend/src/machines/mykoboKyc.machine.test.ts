import { describe, expect, it, vi } from "vitest";
import { assign, createActor, fromPromise, setup, waitFor } from "xstate";

// The real module instantiates a Supabase client at import time, which fails in a node test environment.
vi.mock("../services/auth", () => ({
  AuthService: {
    getTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    storeTokens: vi.fn()
  }
}));

import { MykoboProfile } from "../services/api/mykobo.service";
import { MykoboKycContext } from "./kyc.states";
import { MykoboKycFiles, MykoboKycFormData, MykoboKycMachineErrorType, mykoboKycMachine } from "./mykoboKyc.machine";
import { initialRampContext } from "./ramp.context";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const neverResolves = <T>() => fromPromise<T, MykoboKycContext>(() => new Promise<T>(() => {}));

const baseInput: MykoboKycContext = {
  ...initialRampContext,
  connectedWalletAddress: "0x1111111111111111111111111111111111111111",
  userEmail: "user@example.com"
};

const approvedProfile = { kycStatus: { receivedAt: null, reviewStatus: "approved" } } as MykoboProfile;
const pendingProfile = { kycStatus: { receivedAt: null, reviewStatus: "pending" } } as MykoboProfile;

const formData = { firstName: "Ada", lastName: "Lovelace" } as MykoboKycFormData;
const files = { face: {} as File, front: {} as File, utilityBill: {} as File } as MykoboKycFiles;

type PollResult = { status: "approved" } | { status: "rejected" };

// XState actor logic is invariant in its output type, so fakes must declare the exact output of the real actor.
const profileActor = (result: MykoboProfile | null) => fromPromise<MykoboProfile | null, MykoboKycContext>(async () => result);

function createTestActor(actors: Parameters<typeof mykoboKycMachine.provide>[0]["actors"]) {
  return createActor(mykoboKycMachine.provide({ actors }), { input: baseInput });
}

describe("mykoboKycMachine", () => {
  it("walks the happy path from form filling to Done", async () => {
    const check = deferred<MykoboProfile | null>();
    const submit = deferred<MykoboProfile>();
    const poll = deferred<PollResult>();
    const actor = createTestActor({
      checkExistingProfile: fromPromise(() => check.promise),
      pollProfileStatus: fromPromise(() => poll.promise),
      submitProfile: fromPromise(() => submit.promise)
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe("CheckingProfile");

    check.resolve(null);
    await waitFor(actor, s => s.matches("FormFilling"));

    actor.send({ files, formData, type: "SubmitKycForm" });
    expect(actor.getSnapshot().value).toBe("Submitting");
    expect(actor.getSnapshot().context.formData).toEqual(formData);
    expect(actor.getSnapshot().context.files).toBe(files);

    submit.resolve(pendingProfile);
    await waitFor(actor, s => s.matches("Verifying"));

    poll.resolve({ status: "approved" });
    await waitFor(actor, s => s.matches("VerificationDone"));
    expect(actor.getSnapshot().context.profileApproved).toBe(true);

    actor.send({ type: "CONFIRM_SUCCESS" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("Done");
    expect(snapshot.status).toBe("done");
    expect(snapshot.output).toEqual({ error: undefined, profileApproved: true });
  });

  it("skips straight to Done when the profile is already approved", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(approvedProfile)
    });
    actor.start();

    await waitFor(actor, s => s.status === "done");
    expect(actor.getSnapshot().value).toBe("Done");
    expect(actor.getSnapshot().output).toEqual({ error: undefined, profileApproved: true });
  });

  it("resumes verification when a profile is still pending", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(pendingProfile),
      pollProfileStatus: neverResolves<PollResult>()
    });
    actor.start();

    await waitFor(actor, s => s.matches("Verifying"));
    expect(actor.getSnapshot().context.profileApproved).toBeUndefined();
  });

  it("moves to Failure when the profile check fails", async () => {
    const actor = createTestActor({
      checkExistingProfile: fromPromise<MykoboProfile | null, MykoboKycContext>(async () => {
        throw new Error("network down");
      })
    });
    actor.start();

    await waitFor(actor, s => s.matches("Failure"));
    const snapshot = actor.getSnapshot();
    // Failure is intentionally non-final: the parent dismisses it via RESET_RAMP.
    expect(snapshot.status).toBe("active");
    expect(snapshot.context.error?.type).toBe(MykoboKycMachineErrorType.UnknownError);
    expect(snapshot.context.error?.message).toBe("Failed to check Mykobo profile");
  });

  it("cancelling the form finishes with a UserRejected error", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(null)
    });
    actor.start();
    await waitFor(actor, s => s.matches("FormFilling"));

    actor.send({ type: "CANCEL" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("Cancelled");
    expect(snapshot.status).toBe("done");
    expect(snapshot.output?.error?.type).toBe(MykoboKycMachineErrorType.UserRejected);
  });

  it("moves to Failure when profile submission fails", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(null),
      submitProfile: fromPromise<MykoboProfile, MykoboKycContext>(async () => {
        throw new Error("500");
      })
    });
    actor.start();
    await waitFor(actor, s => s.matches("FormFilling"));

    actor.send({ files, formData, type: "SubmitKycForm" });
    await waitFor(actor, s => s.matches("Failure"));
    expect(actor.getSnapshot().context.error?.message).toBe("Failed to submit Mykobo profile");
  });

  it("moves to Rejected with a KycRejected error when the review is rejected", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(pendingProfile),
      pollProfileStatus: fromPromise<PollResult, MykoboKycContext>(async () => ({ status: "rejected" }))
    });
    actor.start();

    await waitFor(actor, s => s.matches("Rejected"));
    const snapshot = actor.getSnapshot();
    // Rejected is intentionally non-final so the rejection screen stays rendered.
    expect(snapshot.status).toBe("active");
    expect(snapshot.context.error?.type).toBe(MykoboKycMachineErrorType.KycRejected);
    expect(snapshot.context.profileApproved).toBeUndefined();
  });

  it("moves to Failure when polling errors out (e.g. timeout)", async () => {
    const actor = createTestActor({
      checkExistingProfile: profileActor(pendingProfile),
      pollProfileStatus: fromPromise<PollResult, MykoboKycContext>(async () => {
        throw new Error("KYC polling timed out");
      })
    });
    actor.start();

    await waitFor(actor, s => s.matches("Failure"));
    expect(actor.getSnapshot().context.error?.message).toBe("KYC verification failed");
  });

  it("forwards SIGNING_UPDATE events to the parent machine", async () => {
    const childMachine = mykoboKycMachine.provide({
      actors: { checkExistingProfile: neverResolves<MykoboProfile | null>() }
    });
    const parentMachine = setup({
      actors: { mykoboKyc: childMachine },
      types: {
        context: {} as { received: unknown[] },
        events: {} as { type: "SIGNING_UPDATE"; phase: string | undefined; current?: number; max?: number }
      }
    }).createMachine({
      context: { received: [] },
      invoke: { id: "mykoboKyc", input: baseInput, src: "mykoboKyc" },
      on: {
        SIGNING_UPDATE: {
          actions: assign({ received: ({ context, event }) => [...context.received, event] })
        }
      }
    });

    const parent = createActor(parentMachine);
    parent.start();
    const child = parent.getSnapshot().children.mykoboKyc;
    expect(child).toBeDefined();

    child?.send({ current: 1, max: 3, phase: "started", type: "SIGNING_UPDATE" });
    expect(parent.getSnapshot().context.received).toEqual([{ current: 1, max: 3, phase: "started", type: "SIGNING_UPDATE" }]);
  });
});
