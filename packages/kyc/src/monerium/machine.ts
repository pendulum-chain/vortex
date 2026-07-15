import { assign, type DoneActorEvent, fromPromise, setup } from "xstate";
import type { MoneriumKycDeps } from "./api";
import type { MoneriumKycContext, MoneriumKycInput, MoneriumKycOutput, MoneriumStatusResponse } from "./types";
import { MoneriumAuthorizationRequiredError } from "./types";

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error("Monerium onboarding failed");
}

function statusOutput(event: unknown): MoneriumStatusResponse {
  return (event as DoneActorEvent<MoneriumStatusResponse>).output;
}

export function createMoneriumKycMachine({ api, openAuthorizationUrl }: MoneriumKycDeps) {
  return setup({
    actions: {
      openAuthorization: ({ context }) => {
        if (context.authorizationUrl) openAuthorizationUrl(context.authorizationUrl);
      },
      storeStatus: assign({
        customerType: ({ event }) => statusOutput(event).customerType,
        error: () => undefined,
        profileId: ({ event }) => statusOutput(event).profileId,
        status: ({ event }) => statusOutput(event).status,
        statusExternal: ({ event }) => statusOutput(event).statusExternal
      })
    },
    actors: {
      checkStatus: fromPromise(({ input }: { input: MoneriumKycInput }) => api.getStatus(input.customerType)),
      completeOAuth: fromPromise(({ input }: { input: { code: string; state: string } }) =>
        api.completeOAuth(input.code, input.state)
      ),
      startOAuth: fromPromise(({ input }: { input: MoneriumKycInput }) => api.startOAuth(input.customerType))
    },
    guards: {
      callbackHasCode: ({ context }) => !!context.callback && "code" in context.callback,
      callbackHasError: ({ context }) => !!context.callback && "error" in context.callback,
      isApproved: ({ event }) => statusOutput(event).status === "APPROVED",
      isRejected: ({ event }) => statusOutput(event).status === "REJECTED",
      needsUserAction: ({ event }) => ["created", "incomplete"].includes(statusOutput(event).statusExternal.toLowerCase())
    },
    types: {
      context: {} as MoneriumKycContext,
      events: {} as { type: "CLOSE" } | { type: "REFRESH" } | { type: "RETRY" } | { type: "START_OAUTH" },
      input: {} as MoneriumKycInput,
      output: {} as MoneriumKycOutput
    }
  }).createMachine({
    context: ({ input }) => ({ ...input }),
    id: "moneriumKyc",
    initial: "Routing",
    output: ({ context }) => context,
    states: {
      Approved: {
        on: { CLOSE: { target: "Done" } }
      },
      CheckingStatus: {
        invoke: {
          input: ({ context }) => ({ customerType: context.customerType }),
          onDone: [
            {
              actions: "storeStatus",
              guard: "isApproved",
              target: "Approved"
            },
            {
              actions: "storeStatus",
              guard: "isRejected",
              target: "Rejected"
            },
            {
              actions: "storeStatus",
              guard: "needsUserAction",
              target: "Ready"
            },
            {
              actions: "storeStatus",
              target: "InReview"
            }
          ],
          onError: [
            {
              guard: ({ event }) => event.error instanceof MoneriumAuthorizationRequiredError,
              target: "Ready"
            },
            {
              actions: assign({ error: ({ event }) => errorFrom(event.error) }),
              target: "Failure"
            }
          ],
          src: "checkStatus"
        }
      },
      CompletingAuthorization: {
        invoke: {
          input: ({ context }) => {
            if (!context.callback || !("code" in context.callback)) throw new Error("OAuth callback is missing");
            return context.callback;
          },
          onDone: [
            { actions: "storeStatus", guard: "isApproved", target: "Approved" },
            { actions: "storeStatus", guard: "isRejected", target: "Rejected" },
            { actions: "storeStatus", guard: "needsUserAction", target: "Ready" },
            { actions: "storeStatus", target: "InReview" }
          ],
          onError: {
            actions: assign({ error: ({ event }) => errorFrom(event.error) }),
            target: "Failure"
          },
          src: "completeOAuth"
        }
      },
      Done: { type: "final" },
      Failure: {
        on: { CLOSE: { target: "Done" }, RETRY: { target: "Ready" } }
      },
      InReview: {
        on: { CLOSE: { target: "Done" }, REFRESH: { target: "CheckingStatus" } }
      },
      Ready: {
        on: { CLOSE: { target: "Done" }, START_OAUTH: { target: "StartingAuthorization" } }
      },
      Redirecting: {
        entry: "openAuthorization"
      },
      Rejected: {
        on: { CLOSE: { target: "Done" }, RETRY: { target: "Ready" } }
      },
      Routing: {
        always: [
          {
            actions: assign({
              error: ({ context }) => {
                if (!context.callback || !("error" in context.callback)) return undefined;
                return new Error(context.callback.errorDescription ?? "Monerium authorization was cancelled");
              }
            }),
            guard: "callbackHasError",
            target: "Failure"
          },
          { guard: "callbackHasCode", target: "CompletingAuthorization" },
          { target: "CheckingStatus" }
        ]
      },
      StartingAuthorization: {
        invoke: {
          input: ({ context }) => ({ customerType: context.customerType }),
          onDone: {
            actions: assign({ authorizationUrl: ({ event }) => event.output.authorizationUrl, error: () => undefined }),
            target: "Redirecting"
          },
          onError: {
            actions: assign({ error: ({ event }) => errorFrom(event.error) }),
            target: "Failure"
          },
          src: "startOAuth"
        }
      }
    }
  });
}

export type MoneriumKycMachine = ReturnType<typeof createMoneriumKycMachine>;
