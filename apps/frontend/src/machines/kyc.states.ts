import {
  AlfredpayKycContext,
  AlfredpayKycOutput,
  type AveniaKycContext,
  KycStatus,
  type MoneriumKycInput,
  type MoneriumKycOutput
} from "@vortexfi/kyc";
import { FiatToken } from "@vortexfi/shared";
import { assign, DoneActorEvent, sendTo } from "xstate";
import { ALFREDPAY_FIAT_TOKEN_TO_COUNTRY } from "../constants/fiatAccountMethods";
import type { MoneriumWalletInput, MoneriumWalletOutput } from "./moneriumWallet.machine";
import { MykoboKycFiles, MykoboKycFormData, MykoboKycMachineError, MykoboKycMachineErrorType } from "./mykoboKyc.machine";
import { RampContext } from "./types";

type KycChildId = "aveniaKyc" | "alfredpayKyc" | "moneriumKyc" | "mykoboKyc";

const KYC_CHILD_BY_FIAT: Record<FiatToken, KycChildId> = {
  // EUR onboards through Monerium OAuth; the Mykobo child stays only for persisted legacy flows.
  [FiatToken.EURC]: "moneriumKyc",
  [FiatToken.BRL]: "aveniaKyc",
  [FiatToken.ARS]: "alfredpayKyc",
  [FiatToken.USD]: "alfredpayKyc",
  [FiatToken.MXN]: "alfredpayKyc",
  [FiatToken.COP]: "alfredpayKyc"
};

// In the normal flow the fiat token comes from the quote (executionInput); in the quote-less
// KYB deep-link flow it comes from the region the user picked (kybLink.fiatToken).
const resolveKycFiatToken = (context: RampContext): FiatToken | undefined =>
  context.executionInput?.fiatToken ?? context.kybLink?.fiatToken;

export interface MykoboKycContext extends RampContext {
  formData?: MykoboKycFormData;
  files?: MykoboKycFiles;
  profileApproved?: boolean;
  error?: MykoboKycMachineError;
}

type MykoboKycOutput = { profileApproved?: boolean; error?: MykoboKycMachineError };

const moneriumCustomerType = (context: RampContext) =>
  context.kybLink?.customerType === "business" ? "business" : "individual";

const clearSigningPhase = assign({
  rampSigningPhase: undefined,
  rampSigningPhaseCurrent: undefined,
  rampSigningPhaseMax: undefined
});

export const kycStateNode = {
  initial: "Deciding",
  on: {
    GO_BACK: [
      {
        // `?kybLocked=` pins the region — leaving and re-entering KYC would restart the child flow, so back does nothing.
        guard: ({ context }: { context: RampContext }) => !!context.kybLink?.regionLocked
      },
      {
        // KYB deep link has no quote to return to — go back to the region selector instead.
        actions: [clearSigningPhase],
        guard: ({ context }: { context: RampContext }) => !!context.kybLink,
        target: "#ramp.SelectRegion"
      },
      {
        actions: [clearSigningPhase],
        target: "#ramp.QuoteReady"
      }
    ],
    SummaryConfirm: {
      actions: [
        sendTo(
          ({ context }: { context: RampContext }) => {
            const fiatToken = resolveKycFiatToken(context);
            return fiatToken ? KYC_CHILD_BY_FIAT[fiatToken] : "aveniaKyc";
          },
          { type: "SummaryConfirm" }
        )
      ]
    }
  },
  states: {
    Alfredpay: {
      invoke: {
        id: "alfredpayKyc",
        // The shared machine takes no ramp state — only the corridor and the customer type.
        input: ({ context }: { context: RampContext }): AlfredpayKycContext => {
          const fiatToken = resolveKycFiatToken(context);
          const country = fiatToken ? (ALFREDPAY_FIAT_TOKEN_TO_COUNTRY[fiatToken] ?? "US") : "US";
          return {
            business: context.kybLink ? context.kybLink.customerType === "business" : undefined,
            country
          };
        },
        onDone: [
          {
            actions: assign({
              initializeFailedMessage: ({ event }: { event: DoneActorEvent<AlfredpayKycOutput> }) =>
                event.output.error?.message || "An unknown error occurred"
            }),
            guard: ({ event }: { event: DoneActorEvent<AlfredpayKycOutput> }) => !!event.output.error,
            target: "#ramp.KycFailure"
          },
          {
            target: "VerificationComplete"
          }
        ],
        onError: {
          actions: assign({
            initializeFailedMessage: "Alfredpay KYC verification failed. Please retry."
          }),
          target: "#ramp.KycFailure"
        },
        src: "alfredpayKyc"
      }
    },
    Avenia: {
      invoke: {
        id: "aveniaKyc",
        input: ({ context }: { context: RampContext }): AveniaKycContext => {
          return {
            ...context,
            kycFormData: context.kycFormData,
            // KYB deep link has no quote-supplied taxId; the CNPJ is collected on the Avenia company form instead.
            taxId: context.executionInput?.taxId ?? ""
          };
        },
        onDone: [
          {
            actions: assign({
              kycFormData: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) => event.output.kycFormData
            }),
            guard: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) =>
              !event.output.error && event.output.kycStatus === KycStatus.APPROVED,
            target: "VerificationComplete"
          },
          {
            actions: assign({
              initializeFailedMessage: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) =>
                event.output.error?.message || "An unknown error occurred"
            }),
            target: "#ramp.KycFailure"
          }
        ],
        onError: {
          actions: assign({
            initializeFailedMessage: "Avenia KYC verification failed. Please retry."
          }),
          target: "#ramp.KycFailure"
        },
        src: "aveniaKyc"
      }
    },
    Deciding: {
      always: [
        {
          guard: ({ context }: { context: RampContext }) => {
            const fiatToken = resolveKycFiatToken(context);
            return !!fiatToken && KYC_CHILD_BY_FIAT[fiatToken] === "alfredpayKyc";
          },
          target: "Alfredpay"
        },
        {
          guard: ({ context }: { context: RampContext }) => {
            const fiatToken = resolveKycFiatToken(context);
            return !!fiatToken && KYC_CHILD_BY_FIAT[fiatToken] === "moneriumKyc";
          },
          target: "Monerium"
        },
        {
          guard: ({ context }: { context: RampContext }) => {
            const fiatToken = resolveKycFiatToken(context);
            return !!fiatToken && KYC_CHILD_BY_FIAT[fiatToken] === "mykoboKyc";
          },
          target: "Mykobo"
        },
        {
          target: "Avenia"
        }
      ]
    },
    Monerium: {
      invoke: {
        id: "moneriumKyc",
        input: ({ context }: { context: RampContext }): MoneriumKycInput => ({
          callback: context.moneriumCallback,
          customerType: moneriumCustomerType(context)
        }),
        onDone: [
          {
            actions: assign({ moneriumCallback: undefined }),
            guard: ({ event }: { event: DoneActorEvent<MoneriumKycOutput> }) => event.output.status === "APPROVED",
            target: "MoneriumWallet"
          },
          {
            // Closed before approval (in review, rejected, cancelled): keep the quote, explain, and let the user retry.
            actions: [
              clearSigningPhase,
              assign({
                initializeFailedMessage: ({ event }: { event: DoneActorEvent<MoneriumKycOutput> }) =>
                  event.output.error?.message ||
                  (event.output.status ? "Monerium has not approved your verification yet." : undefined),
                moneriumCallback: undefined
              })
            ],
            target: "#ramp.QuoteReady"
          }
        ],
        onError: {
          actions: assign({
            initializeFailedMessage: "Monerium verification failed. Please retry.",
            moneriumCallback: undefined
          }),
          target: "#ramp.KycFailure"
        },
        src: "moneriumKyc"
      },
      on: {
        // The OAuth round trip restores the ramp here; restart the child with the callback so it completes the exchange.
        MONERIUM_CALLBACK: {
          actions: assign({
            moneriumCallback: ({ event }: { event: { callback: RampContext["moneriumCallback"] } }) => event.callback
          }),
          reenter: true,
          target: "Monerium"
        },
        MONERIUM_REFRESH: {
          actions: sendTo("moneriumKyc", { type: "REFRESH" })
        }
      }
    },
    MoneriumWallet: {
      invoke: {
        id: "moneriumWallet",
        input: ({ context }: { context: RampContext }): MoneriumWalletInput => ({
          address: context.connectedWalletAddress,
          customerType: moneriumCustomerType(context),
          // Substrate wallets report a negative chain id; the permit needs an EOA on an EVM chain.
          isEvmWallet: context.chainId !== undefined && context.chainId > 0,
          signMessage: context.getMessageSignature
        }),
        onDone: [
          {
            guard: ({ event }: { event: DoneActorEvent<MoneriumWalletOutput> }) => event.output.ready,
            target: "VerificationComplete"
          },
          {
            actions: [
              clearSigningPhase,
              assign({
                initializeFailedMessage: ({ event }: { event: DoneActorEvent<MoneriumWalletOutput> }) =>
                  event.output.error || "Your wallet is not linked to Monerium yet."
              })
            ],
            target: "#ramp.QuoteReady"
          }
        ],
        onError: {
          actions: assign({ initializeFailedMessage: "Could not link your wallet to Monerium. Please retry." }),
          target: "#ramp.KycFailure"
        },
        src: "moneriumWallet"
      }
    },
    Mykobo: {
      invoke: {
        id: "mykoboKyc",
        input: ({ context }: { context: RampContext }): MykoboKycContext => ({
          ...context
        }),
        onDone: [
          {
            guard: ({ event }: { event: DoneActorEvent<MykoboKycOutput> }) => !!event.output.profileApproved,
            target: "VerificationComplete"
          },
          {
            actions: assign({
              rampSigningPhase: undefined,
              rampSigningPhaseCurrent: undefined,
              rampSigningPhaseMax: undefined
            }),
            guard: ({ event }: { event: DoneActorEvent<MykoboKycOutput> }) =>
              event.output.error?.type === MykoboKycMachineErrorType.UserRejected,
            target: "#ramp.QuoteReady"
          },
          {
            actions: assign({
              initializeFailedMessage: ({ event }: { event: DoneActorEvent<MykoboKycOutput> }) =>
                event.output.error?.message || "An unknown error occurred"
            }),
            target: "#ramp.KycFailure"
          }
        ],
        onError: {
          actions: assign({
            initializeFailedMessage: "Mykobo KYC verification failed. Please retry."
          }),
          target: "#ramp.KycFailure"
        },
        src: "mykoboKyc"
      }
    },
    VerificationComplete: {
      always: [
        {
          // KYB deep-link flow has no quote/summary to return to — go straight to the success screen.
          guard: ({ context }: { context: RampContext }) => !!context.kybLink,
          target: "#ramp.KybLinkComplete"
        },
        {
          target: "#ramp.KycComplete"
        }
      ]
    }
  }
};
