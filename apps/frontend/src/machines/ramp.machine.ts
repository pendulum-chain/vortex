import { assign, fromPromise, setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampExecutionInput } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { kycMachine } from "./kyc.machine";
import { RampContext, RampState } from "./types";
import { updateRampMachine } from "./update.machine";

export const rampMachine = setup({
  actors: {
    registerRamp: fromPromise(registerRampActor), // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    startRamp: startRampActor,
    validateKyc: fromPromise(validateKycActor)
  },
  types: {
    context: {} as RampContext,
    events: {} as
      | { type: "confirm" }
      | { type: "onDone"; output: RampState }
      | {
          type: "modifyExecutionInput";
          output: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection };
        }
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCcCGBbADgOgJIQBswBiAYwHsA7AMwEtl0BtABgF1FRNzZaAXWqhxAAPRACYArAHZsARmayJATiUAOAGxrNEgDQgAnuIAsMo7PXqxSqdJPmpAXwd60WPIRLpyEWtX0BRYTBSAFd+KlxKTDCWdiQQLh5wyiFRBDNsFSzs7I09QwRZI3VsAGZS1SMlMRtiqUl1JxcMHABpAE0AYWIIKjBsWkoAN3IAa37XNq6EQZHSVGTY2KFEvgEU+LT5UolsZmKlUvtVUvV6-ONVTPNLWuLzJSaQSewAJRbXsABHELheSB6fQGwzGExabw+31+sH+EBmIPmizYy3iq2SqUQ0hKpTU90OJhUF0KzF2N3U5lkNiOsjEpSeL3eWE+Pz+AN6lH6s1B2AZkJZMMg8LmC3WS1kcU43DWgk2mKk2Nx5PxUkJBku1wsNQkRnumnp4MZmGZ0NhxDAyGQ5GQ2EwBAW1Ct6B5Br5JsFXMRouRbBWUvRsoQWLKitkytVBRxsmwFgsFSUshxYkk+rcnygtAFyENgI5wJG42dqbA6czhqF5E9VCWPtRfvWGMKyiM0akofUqiUxSMzFUujVCFUYky6h7HcHZ1qjWczwNxYz-yzLTNFqtNrtvAdDELODT8-NZY9Iqr3olCTrMtAWybLbbHa7Pb7BUkV0sVUOEgksl7RRTOAAyrwqDILw2bspyIIFi8AFASBLTlpWlDVqeaL1gGYhVMw2BSEYSbWJoxRiOoRLxlhb7qB+7YVK2qi-tg0HAdm5qWtatr2o6250YBDFwYeSKsCikpJKhl7GEomHYbh8qdpYRH9gmShlNhagqOopTMKUYiqI404vAAqpgEALGAoFAlykHgvphn-AeCJHohJ6+kJF4iIgoZVNgEi0hI5SflIPbykSg7DqOaiEVIk5ONOlDeHAQiTI50obCJCAALQlMwGWZVlmVFESaV7NlhUZdpzRuAAYqgtAECEyBgAl-rJWFQ5nNYhzMO2rbqUSRQKehKi9jh6nMJptH4EQ9XCS5xIyKoGWzWIsg0lYZiyU+JgauSRhaepFTobRHSdBNzlpNtHmRjs0hJrURJJs2K1KvKZhWPKtGGmV5AEAQ5AAO76UdSVTU1LatWpHXbMR4lvp5d7yL2jw6S6TJQqyED-Q2pQ2B5mULXNhGfo+4jodg92ho9NJ4a9c6li0aMBgmqhRjsnZGJ5YgZRIzBSMRuxKZ2H6UtUyg0Qjbj0bBWC041Vi7CcI4mCSWmtqUgVRhzOU1BYYmdrRllGYaktTZSvZ7IoUgY2YzAqBIqgq1j6vypoltGJFDhAA */
  context: {
    address: undefined,
    assethubApiComponents: undefined,
    authToken: undefined,
    canRegisterRamp: false,
    chainId: undefined,
    executionInput: undefined,
    getMessageSignature: undefined,
    initializeFailedMessage: undefined,
    moonbeamApiComponents: undefined,
    pendulumApiComponents: undefined,
    rampDirection: undefined,
    rampExecutionInput: undefined,
    rampKycLevel2Started: false,
    rampKycStarted: false,
    rampPaymentConfirmed: false,
    rampSigningPhase: undefined,
    rampState: undefined,
    rampSummaryVisible: false,
    signingRejected: false,
    siwe: undefined,
    substrateWalletAccount: undefined
  },
  id: "ramp",
  initial: "Idle",
  states: {
    Failure: {},
    Idle: {
      on: {
        confirm: "RampRequested",
        modifyExecutionInput: {
          actions: assign(({ context, event }) => {
            context.executionInput = event.output.executionInput;
            context.chainId = event.output.chainId;
            context.rampDirection = event.output.rampDirection;
            return context;
          })
        }
      }
    },
    KYC: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          target: "RegisterRamp"
        },
        src: kycMachine
      }
    },
    RampFollowUp: {},
    RampRequested: {
      invoke: {
        input: ({ context }) => context,
        onDone: [
          {
            // The guard checks validateKyc output
            guard: ({ event }) => !event.output.kycNeeded,
            target: "RegisterRamp"
          },
          {
            // Fallback. Go to child state machine "KYC"
            target: "KYC"
          }
        ],
        onError: "Failure",
        src: "validateKyc"
      }
    },
    RegisterRamp: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            rampState: ({ event }) => event.output
          }),
          target: "UpdateRamp"
        },
        onError: "Failure",
        src: "registerRamp"
      }
    },
    StartRamp: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          target: "RampFollowUp"
        },
        onError: {
          target: "Failure"
        },
        src: "startRamp"
      }
    },
    UpdateRamp: {
      invoke: {
        input: ({ context }: { context: RampContext }) => context,
        onDone: {
          // an event in this state, only then it should transition to StartRamp
          actions: assign(({ context, event }) => {
            context = event.output as RampContext; // TODO: we define the output, why is this not typed?
            return context;
          }), // TODO add guard to check if the payment was confirmed ONLY FOR ONRAMPS. That UI element should trigger
          target: "StartRamp"
        },
        src: updateRampMachine
      }
    }
  }
});
