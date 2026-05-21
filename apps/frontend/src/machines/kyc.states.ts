import { FiatToken, KycFailureReason } from "@vortexfi/shared";
import { assign, DoneActorEvent, sendTo } from "xstate";
import { ALFREDPAY_FIAT_TOKEN_TO_COUNTRY } from "../constants/fiatAccountMethods";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { KycStatus } from "../services/signingService";
import {
  AlfredpayKycMachineError,
  KybBusinessFiles,
  KybFormData,
  KybPersonFiles,
  MxnKycFiles,
  MxnKycFormData
} from "./alfredpayKyc.machine";
import { AveniaKycMachineError, UploadIds } from "./brlaKyc.machine";
import { MoneriumKycMachineError } from "./moneriumKyc.machine";
import { MykoboKycFiles, MykoboKycFormData, MykoboKycMachineError, MykoboKycMachineErrorType } from "./mykoboKyc.machine";
import { RampContext, SelectedAveniaData } from "./types";

// Extended context types for child KYC machines
export interface AlfredpayKycContext extends RampContext {
  verificationUrl?: string;
  submissionId?: string;
  country: string;
  error?: AlfredpayKycMachineError;
  business?: boolean;
  mxnFormData?: MxnKycFormData;
  mxnFiles?: MxnKycFiles;
  kybFormData?: KybFormData;
  kybBusinessFiles?: KybBusinessFiles;
  kybRelatedPersonFiles?: KybPersonFiles[];
  kybRelatedPersonIndex?: number;
  kybRelatedPersonIds?: string[];
}

export interface AveniaKycContext extends RampContext {
  taxId: string;
  subAccountId?: string;
  kycFormData?: KYCFormData;
  livenessCheckOpened?: boolean;
  kycStatus?: KycStatus;
  rejectReason?: KycFailureReason | string;
  documentUploadIds?: UploadIds;
  error?: AveniaKycMachineError;
  isCompany?: boolean; // Flag to identify if the user is a business (CNPJ) or individual (CPF)
  kybAttemptId?: string;
  kybUrls?: {
    authorizedRepresentativeUrl: string;
    basicCompanyDataUrl: string;
  };
  kybStep?: "company" | "representative" | "verification";
  companyVerificationStarted?: boolean;
  representativeVerificationStarted?: boolean;
}

export interface MoneriumKycContext extends RampContext {
  authCode?: string;
  authUrl?: string;
  codeVerifier?: string;
  error?: MoneriumKycMachineError;
  redirectReady?: boolean;
}

export interface MykoboKycContext extends RampContext {
  formData?: MykoboKycFormData;
  files?: MykoboKycFiles;
  profileApproved?: boolean;
  error?: MykoboKycMachineError;
}

type MykoboKycOutput = { profileApproved?: boolean; error?: MykoboKycMachineError };

// Single source of truth for KYC routing. Both the `SummaryConfirm` sendTo callback
// and the `Deciding` state's `always` transitions read from this map.
type KycRoute = { actorId: string; target: string };
const KYC_ROUTE_BY_TOKEN: Partial<Record<FiatToken, KycRoute>> = {
  [FiatToken.BRL]: { actorId: "aveniaKyc", target: "Avenia" },
  [FiatToken.EURC]: { actorId: "mykoboKyc", target: "Mykobo" },
  [FiatToken.USD]: { actorId: "alfredpayKyc", target: "Alfredpay" },
  [FiatToken.MXN]: { actorId: "alfredpayKyc", target: "Alfredpay" },
  [FiatToken.COP]: { actorId: "alfredpayKyc", target: "Alfredpay" }
};
const resolveKycRoute = (token: FiatToken | undefined): KycRoute | undefined => (token ? KYC_ROUTE_BY_TOKEN[token] : undefined);

// Logic of the KYC node:
// The node attempts to abstract the generic "Started" -> "Verifying" -> "Done" flow of any KYC process.
// The "Verifying" state will invoke child actors based on the particula ramp.
// The output of these state-machine actors will always be assigned to the RampContext's `kycResponse` property.
export const kycStateNode = {
  entry: ({ context }: { context: RampContext }) =>
    console.log("DEBUG: Entering KYC state node. RampContext kycFormData:", context.kycFormData),
  initial: "Deciding",
  on: {
    GO_BACK: {
      actions: [assign({ rampSigningPhase: undefined })],
      target: "#ramp.QuoteReady"
    },
    SummaryConfirm: {
      actions: [
        // Routes the SummaryConfirm event to the active KYC actor. Unknown tokens get a sentinel
        // actor id; XState logs a warning and the Deciding state's fallback routes to KycFailure.
        sendTo(({ context }) => resolveKycRoute(context.executionInput?.fiatToken)?.actorId ?? "noKycActor", {
          type: "SummaryConfirm"
        }),
        ({ event }: any) => {
          console.log("SummaryConfirm event:", event);
        }
      ]
    }
  },
  states: {
    Alfredpay: {
      invoke: {
        id: "alfredpayKyc",
        input: ({ context }: { context: RampContext }): AlfredpayKycContext => {
          console.log("Invoking Alfredpay KYC actor with RampContext input:", context);
          const fiatToken = context.executionInput?.fiatToken;
          const country = fiatToken ? (ALFREDPAY_FIAT_TOKEN_TO_COUNTRY[fiatToken] ?? "US") : "US";
          return {
            ...context,
            country
          };
        },
        onDone: [
          {
            actions: assign({
              initializeFailedMessage: ({ event }: { event: any }) =>
                (event.output.error as AlfredpayKycMachineError)?.message || "An unknown error occurred"
            }),
            guard: ({ event }: { event: any }) => !!event.output.error,
            target: "#ramp.KycFailure"
          },
          {
            actions: assign(({ context }: { context: RampContext }) => {
              return {
                ...context
              };
            }),
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
          console.log("Invoking Avenia KYC actor with RampContext input:", context);
          return {
            ...context,
            kycFormData: context.kycFormData, // Pass kycFormData from parent RampContext to AveniaKycContext
            taxId: context.executionInput?.taxId!
          };
        },
        onDone: [
          {
            actions: assign({
              kycFormData: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) => event.output.kycFormData
            }),
            guard: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) => !event.output.error,
            target: "VerificationComplete"
          },
          {
            actions: assign({
              initializeFailedMessage: ({ event }: { event: DoneActorEvent<AveniaKycContext> }) =>
                (event.output.error as AveniaKycMachineError).message
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
        ...(Object.entries(KYC_ROUTE_BY_TOKEN) as [FiatToken, KycRoute][]).map(([token, route]) => ({
          guard: ({ context }: { context: RampContext }) => context.executionInput?.fiatToken === token,
          target: route.target
        })),
        // Fallback: any fiat token without a registered KYC actor (e.g. ARS today) fails fast
        // rather than stalling in Deciding forever.
        {
          actions: assign({
            initializeFailedMessage: ({ context }: { context: RampContext }) =>
              `No KYC flow available for ${context.executionInput?.fiatToken ?? "unknown"} token.`
          }),
          target: "#ramp.KycFailure"
        }
      ]
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
            actions: [assign({ rampSigningPhase: undefined }), { type: "showSigningRejectedErrorToast" }],
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
      always: {
        target: "#ramp.KycComplete"
      },
      entry: {
        actions: [
          ({ context }: any) => {
            console.log("KYC verification completed successfully:", context.kycResponse);
          }
        ]
      }
    }
  }
};
