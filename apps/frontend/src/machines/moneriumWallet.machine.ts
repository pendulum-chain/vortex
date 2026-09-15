import * as Sentry from "@sentry/react";
import {
  MONERIUM_REAUTHENTICATION_REQUIRED,
  MoneriumAuthorizationRequiredError,
  type MoneriumCustomerType,
  type MoneriumKycApi,
  type MoneriumRampReadiness,
  type MoneriumWalletApi
} from "@vortexfi/kyc";
import { buildMoneriumWalletLinkMessage } from "@vortexfi/shared";
import { assign, fromPromise, setup } from "xstate";
import { moneriumKycApi } from "./moneriumKyc.machine";

export interface MoneriumWalletInput {
  address: string | undefined;
  customerType: MoneriumCustomerType;
  /** Substrate wallets cannot sign the ERC-2612 permit the onramp needs. */
  isEvmWallet: boolean;
  signMessage: ((message: string) => Promise<`0x${string}`>) | undefined;
}

export interface MoneriumWalletContext extends MoneriumWalletInput {
  error?: string;
  /** Set once this wallet was linked in this flow, so readiness reads are interpreted for it. */
  linked?: boolean;
  /** Provisioning polls so far; the wait is bounded rather than spinning forever. */
  polls?: number;
  readiness?: MoneriumRampReadiness;
}

export interface MoneriumWalletOutput {
  error?: string;
  ready: boolean;
}

export type MoneriumWalletEvent = { type: "CANCEL" } | { type: "CONFIRM_MOVE" } | { type: "RETRY" };

type MoneriumWalletApiClient = Pick<MoneriumKycApi, "getStatus"> & MoneriumWalletApi;

const POLL_INTERVAL_MS = 5_000;
/** Monerium usually provisions within seconds; after this many polls the user is told to come back later. */
const MAX_PROVISIONING_POLLS = 36;

function linkedHere(context: MoneriumWalletContext, readiness: MoneriumRampReadiness): boolean {
  return (
    context.linked === true ||
    (!!context.address && !!readiness.linkedAddress && readiness.linkedAddress.toLowerCase() === context.address.toLowerCase())
  );
}

function readinessOf(event: unknown): MoneriumRampReadiness {
  return (event as { output: MoneriumRampReadiness }).output;
}

function errorOf(event: unknown, fallback: string): string {
  const error = (event as { error?: unknown }).error;
  return error instanceof Error ? error.message : fallback;
}

/**
 * Links the connected EOA to the approved Monerium profile and waits until the profile's IBAN
 * points to it, so the EUR onramp can mint there and take its permit. An IBAN that already sits
 * on another wallet or chain is moved only after the user confirms, because that redirects their
 * future SEPA deposits.
 */
export function createMoneriumWalletMachine(
  api: MoneriumWalletApiClient = moneriumKycApi,
  reportError: (error: Error) => void = error => Sentry.captureException(error)
) {
  return setup({
    actions: {
      reportUnexpectedError: ({ event }) => {
        const error = (event as { error?: unknown }).error;
        if (error instanceof Error && !(error instanceof MoneriumAuthorizationRequiredError)) reportError(error);
      },
      storeReadiness: assign({ error: () => undefined, readiness: ({ event }) => readinessOf(event) })
    },
    actors: {
      linkWallet: fromPromise(async ({ input }: { input: MoneriumWalletContext }) => {
        if (!input.address || !input.signMessage || !input.readiness)
          throw new Error("Connect a wallet to link it to Monerium");
        const signature = await input.signMessage(buildMoneriumWalletLinkMessage());
        return api.linkWallet({
          address: input.address,
          chain: input.readiness.chain,
          customerType: input.customerType,
          signature
        });
      }),
      moveIban: fromPromise(async ({ input }: { input: MoneriumWalletContext }) => {
        if (!input.address || !input.readiness) throw new Error("Connect a wallet to move the IBAN to it");
        return api.moveIban({ address: input.address, chain: input.readiness.chain, customerType: input.customerType });
      }),
      readReadiness: fromPromise(async ({ input }: { input: MoneriumWalletContext }): Promise<MoneriumRampReadiness> => {
        const status = await api.getStatus(input.customerType);
        if (status.rampError) {
          if (status.rampError.code === MONERIUM_REAUTHENTICATION_REQUIRED)
            throw new MoneriumAuthorizationRequiredError(status.rampError.message);
          throw new Error(status.rampError.message);
        }
        if (!status.ramp) throw new Error("Monerium has not approved your verification yet");
        return status.ramp;
      }),
      // Monerium provisions the IBAN asynchronously; re-read on a fixed cadence until it lands.
      wait: fromPromise(() => new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS)))
    },
    guards: {
      hasEvmWallet: ({ context }) => context.isEvmWallet && !!context.address,
      isPending: ({ context, event }) => readinessOf(event).iban === "missing" && linkedHere(context, readinessOf(event)),
      isPendingTooLong: ({ context, event }) =>
        readinessOf(event).iban === "missing" &&
        linkedHere(context, readinessOf(event)) &&
        (context.polls ?? 0) >= MAX_PROVISIONING_POLLS,
      isReady: ({ context, event }) => {
        const readiness = readinessOf(event);
        return (
          readiness.iban === "provisioned" &&
          !!context.address &&
          readiness.linkedAddress?.toLowerCase() === context.address.toLowerCase()
        );
      },
      needsMove: ({ context, event }) => readinessOf(event).iban !== "missing" && linkedHere(context, readinessOf(event))
    },
    types: {
      context: {} as MoneriumWalletContext,
      events: {} as MoneriumWalletEvent,
      input: {} as MoneriumWalletInput,
      output: {} as MoneriumWalletOutput
    }
  }).createMachine({
    context: ({ input }) => ({ ...input }),
    id: "moneriumWallet",
    initial: "Guard",
    output: ({ context }) => ({ error: context.error, ready: !context.error && context.readiness?.iban === "provisioned" }),
    states: {
      Cancelled: { type: "final" },
      Checking: {
        invoke: {
          input: ({ context }) => context,
          onDone: [
            { actions: "storeReadiness", guard: "isReady", target: "Ready" },
            { actions: "storeReadiness", guard: "needsMove", target: "NeedsMove" },
            {
              actions: [
                "storeReadiness",
                assign({ error: () => "Monerium has not provisioned your IBAN yet. Please try again later." })
              ],
              guard: "isPendingTooLong",
              target: "Failure"
            },
            { actions: "storeReadiness", guard: "isPending", target: "Waiting" },
            { actions: "storeReadiness", target: "Linking" }
          ],
          onError: {
            actions: [
              "reportUnexpectedError",
              assign({ error: ({ event }) => errorOf(event, "Could not read your Monerium status") })
            ],
            target: "Failure"
          },
          src: "readReadiness"
        }
      },
      Failure: {
        on: {
          CANCEL: { target: "Cancelled" },
          RETRY: { actions: assign({ error: () => undefined }), target: "Checking" }
        }
      },
      Guard: {
        always: [
          { guard: "hasEvmWallet", target: "Checking" },
          { actions: assign({ error: () => "Connect an EVM wallet to receive EUR" }), target: "Cancelled" }
        ]
      },
      Linking: {
        invoke: {
          input: ({ context }) => context,
          onDone: { actions: assign({ linked: () => true }), target: "Checking" },
          onError: {
            actions: [
              "reportUnexpectedError",
              assign({ error: ({ event }) => errorOf(event, "Could not link your wallet to Monerium") })
            ],
            target: "Failure"
          },
          src: "linkWallet"
        }
      },
      Moving: {
        invoke: {
          input: ({ context }) => context,
          onDone: { target: "Checking" },
          onError: {
            actions: ["reportUnexpectedError", assign({ error: ({ event }) => errorOf(event, "Could not move your IBAN") })],
            target: "Failure"
          },
          src: "moveIban"
        }
      },
      NeedsMove: {
        on: {
          CANCEL: { actions: assign({ error: () => "The IBAN was not moved to this wallet" }), target: "Cancelled" },
          CONFIRM_MOVE: { target: "Moving" }
        }
      },
      Ready: { type: "final" },
      Waiting: {
        entry: assign({ polls: ({ context }) => (context.polls ?? 0) + 1 }),
        invoke: { onDone: { target: "Checking" }, src: "wait" },
        on: { CANCEL: { actions: assign({ error: () => "IBAN provisioning was cancelled" }), target: "Cancelled" } }
      }
    }
  });
}

export const moneriumWalletMachine = createMoneriumWalletMachine();
