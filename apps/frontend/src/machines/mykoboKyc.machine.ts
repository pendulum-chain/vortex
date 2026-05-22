import { assign, fromPromise, sendParent, setup } from "xstate";
import { isApiError } from "../services/api/api-client";
import { MykoboProfilePayload, MykoboService } from "../services/api/mykobo.service";
import { RampSigningPhase } from "../types/phases";
import { MykoboKycContext } from "./kyc.states";

export type MykoboKycFormData = Omit<MykoboProfilePayload, "front" | "back" | "face" | "utilityBill" | "walletAddress">;

export interface MykoboKycFiles {
  front: File;
  back?: File;
  face: File;
  utilityBill: File;
}

export enum MykoboKycMachineErrorType {
  UserRejected = "USER_REJECTED",
  KycRejected = "KYC_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}

export class MykoboKycMachineError extends Error {
  type: MykoboKycMachineErrorType;
  constructor(message: string, type: MykoboKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

const POLLING_INTERVAL_MS = 5000;
const POLLING_TIMEOUT_MS = 20 * 60 * 1000;

export const mykoboKycMachine = setup({
  actors: {
    checkExistingProfile: fromPromise(async ({ input }: { input: MykoboKycContext }) => {
      const address = input.connectedWalletAddress;
      if (!address) throw new Error("Wallet address is required");
      return MykoboService.getProfile(address);
    }),
    pollProfileStatus: fromPromise(async ({ input, signal }: { input: MykoboKycContext; signal: AbortSignal }) => {
      const address = input.connectedWalletAddress;
      if (!address) throw new Error("Wallet address is required");
      const deadline = Date.now() + POLLING_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (signal.aborted) throw new Error("Polling aborted");
        try {
          const profile = await MykoboService.getProfile(address);
          const status = profile?.kycStatus.reviewStatus;
          if (status === "approved") return { status: "approved" as const };
          if (status === "rejected") return { status: "rejected" as const };
        } catch (err) {
          // Treat any 4xx (other than 404 — getProfile already maps that to null) as a hard failure;
          // 5xx and network errors are transient and worth retrying within the polling window.
          if (isApiError(err) && err.status >= 400 && err.status < 500) throw err;
          console.warn("Mykobo profile poll failed, retrying:", err);
        }
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, POLLING_INTERVAL_MS);
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          signal.addEventListener("abort", onAbort, { once: true });
        });
      }
      throw new Error("KYC polling timed out");
    }),
    submitProfile: fromPromise(async ({ input }: { input: MykoboKycContext }) => {
      if (!input.formData || !input.files) {
        throw new Error("Form data and files are required");
      }
      const address = input.connectedWalletAddress;
      if (!address) throw new Error("Wallet address is required");
      return MykoboService.createProfile({
        ...input.formData,
        ...input.files,
        walletAddress: address
      });
    })
  },
  types: {
    context: {} as MykoboKycContext,
    events: {} as
      | { type: "SubmitKycForm"; formData: MykoboKycFormData; files: MykoboKycFiles }
      | { type: "CANCEL" }
      | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined },
    input: {} as MykoboKycContext,
    output: {} as { profileApproved?: boolean; error?: MykoboKycMachineError }
  }
}).createMachine({
  context: ({ input }) => ({ ...input }),
  id: "mykoboKyc",
  initial: "CheckingProfile",
  on: {
    SIGNING_UPDATE: {
      actions: [
        sendParent(({ event }) => ({
          phase: event.phase,
          type: "SIGNING_UPDATE"
        }))
      ]
    }
  },
  output: ({ context }) => ({
    error: context.error,
    profileApproved: context.profileApproved
  }),
  states: {
    CheckingProfile: {
      invoke: {
        id: "checkExistingProfile",
        input: ({ context }) => context,
        onDone: [
          {
            actions: assign({ profileApproved: true }),
            guard: ({ event }) => event.output?.kycStatus.reviewStatus === "approved",
            target: "Done"
          },
          {
            guard: ({ event }) => event.output?.kycStatus.reviewStatus === "pending",
            target: "Verifying"
          },
          {
            target: "FormFilling"
          }
        ],
        onError: {
          actions: assign({
            error: () => new MykoboKycMachineError("Failed to check Mykobo profile", MykoboKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "checkExistingProfile"
      }
    },
    Done: {
      type: "final"
    },
    Failure: {
      type: "final"
    },
    FormFilling: {
      on: {
        CANCEL: {
          actions: assign({
            error: () => new MykoboKycMachineError("Cancelled by the user", MykoboKycMachineErrorType.UserRejected)
          }),
          target: "Failure"
        },
        SubmitKycForm: {
          actions: assign(({ event }) => ({
            files: event.files,
            formData: event.formData
          })),
          target: "Submitting"
        }
      }
    },
    Rejected: {
      type: "final"
    },
    Submitting: {
      invoke: {
        id: "submitProfile",
        input: ({ context }) => context,
        onDone: {
          target: "Verifying"
        },
        onError: {
          actions: assign({
            error: () => new MykoboKycMachineError("Failed to submit Mykobo profile", MykoboKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "submitProfile"
      }
    },
    Verifying: {
      invoke: {
        id: "pollProfileStatus",
        input: ({ context }) => context,
        onDone: [
          {
            actions: assign({ profileApproved: true }),
            guard: ({ event }) => event.output.status === "approved",
            target: "Done"
          },
          {
            actions: assign({
              error: () => new MykoboKycMachineError("KYC was rejected", MykoboKycMachineErrorType.KycRejected)
            }),
            target: "Rejected"
          }
        ],
        onError: {
          actions: assign({
            error: () => new MykoboKycMachineError("KYC verification failed", MykoboKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "pollProfileStatus"
      }
    }
  }
});
