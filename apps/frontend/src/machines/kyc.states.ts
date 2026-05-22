import { FiatToken, isAlfredpayToken, KycFailureReason } from "@vortexfi/shared";
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

export interface MykoboKycContext extends RampContext {
  formData?: MykoboKycFormData;
  files?: MykoboKycFiles;
  profileApproved?: boolean;
  error?: MykoboKycMachineError;
}

type MykoboKycOutput = { profileApproved?: boolean; error?: MykoboKycMachineError };

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
        sendTo(
          ({ context }) => {
            if (context.executionInput?.fiatToken === FiatToken.BRL) {
              return "aveniaKyc";
            }
            if (context.executionInput?.fiatToken === FiatToken.EURC) {
              return "mykoboKyc";
            }
            if (context.executionInput?.fiatToken && isAlfredpayToken(context.executionInput.fiatToken)) {
              return "alfredpayKyc";
            }
            return "aveniaKyc";
          },
          { type: "SummaryConfirm" }
        ),
        ({ event }: { event: unknown }) => {
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
              initializeFailedMessage: ({ event }: { event: DoneActorEvent<AlfredpayKycContext> }) =>
                (event.output.error as AlfredpayKycMachineError)?.message || "An unknown error occurred"
            }),
            guard: ({ event }: { event: DoneActorEvent<AlfredpayKycContext> }) => !!event.output.error,
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
            kycFormData: context.kycFormData,
            taxId: context.executionInput?.taxId ?? ""
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
        {
          guard: ({ context }: { context: RampContext }) =>
            !!context.executionInput?.fiatToken && isAlfredpayToken(context.executionInput.fiatToken),
          target: "Alfredpay"
        },
        {
          guard: ({ context }: { context: RampContext }) => context.executionInput?.fiatToken === FiatToken.BRL,
          target: "Avenia"
        },
        {
          guard: ({ context }: { context: RampContext }) => context.executionInput?.fiatToken === FiatToken.EURC,
          target: "Mykobo"
        },
        {
          target: "Avenia"
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
            actions: assign({ rampSigningPhase: undefined }),
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
          () => {
            console.log("KYC verification completed successfully");
          }
        ]
      }
    }
  }
};
