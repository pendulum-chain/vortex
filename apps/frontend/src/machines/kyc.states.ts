import { FiatToken, isAlfredpayToken, KycFailureReason, RampDirection } from "@vortexfi/shared";
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
        // TODO I would prefer to have this uncoupled from the specific implementations, and based on active child.
        sendTo(
          ({ context }) => {
            if (context.executionInput?.fiatToken === FiatToken.BRL) {
              return "aveniaKyc";
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
            kycFormData: context.kycFormData, // Pass kycFormData from parent RampContext to AveniaKycContext
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
          target: "Avenia"
        }
      ]
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
