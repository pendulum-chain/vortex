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
import { RampContext } from "./types";

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
  isCompany?: boolean;
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
type AlfredpayDoneEvent = DoneActorEvent<{ error?: AlfredpayKycMachineError }>;

type KycRoute = { actorId: string; target: string };
const KYC_ROUTE_BY_TOKEN: Partial<Record<FiatToken, KycRoute>> = {
  [FiatToken.BRL]: { actorId: "aveniaKyc", target: "Avenia" },
  [FiatToken.EURC]: { actorId: "mykoboKyc", target: "Mykobo" },
  [FiatToken.USD]: { actorId: "alfredpayKyc", target: "Alfredpay" },
  [FiatToken.MXN]: { actorId: "alfredpayKyc", target: "Alfredpay" },
  [FiatToken.COP]: { actorId: "alfredpayKyc", target: "Alfredpay" }
};

export const kycStateNode = {
  initial: "Deciding",
  on: {
    GO_BACK: {
      actions: [assign({ rampSigningPhase: undefined })],
      target: "#ramp.QuoteReady"
    },
    SummaryConfirm: {
      actions: sendTo(
        ({ context }: { context: RampContext }) => {
          const token = context.executionInput?.fiatToken;
          const route = token ? KYC_ROUTE_BY_TOKEN[token] : undefined;
          if (!route) throw new Error(`No KYC actor registered for fiat token "${token ?? "unknown"}"`);
          return route.actorId;
        },
        { type: "SummaryConfirm" }
      )
    }
  },
  states: {
    Alfredpay: {
      invoke: {
        id: "alfredpayKyc",
        input: ({ context }: { context: RampContext }): AlfredpayKycContext => {
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
              initializeFailedMessage: ({ event }: { event: AlfredpayDoneEvent }) =>
                event.output.error?.message || "An unknown error occurred"
            }),
            guard: ({ event }: { event: AlfredpayDoneEvent }) => !!event.output.error,
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
          const taxId = context.executionInput?.taxId;
          if (!taxId) throw new Error("taxId is required for Avenia KYC");
          return { ...context, kycFormData: context.kycFormData, taxId };
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
                event.output.error?.message ?? "Avenia KYC verification failed"
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
        input: ({ context }: { context: RampContext }): MykoboKycContext => context,
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
      }
    }
  }
};
