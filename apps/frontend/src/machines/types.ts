import { PaymentData, QuoteResponse, RampDirection } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { ActorRef, ActorRefFrom, SnapshotFrom } from "xstate";
import { ToastMessage } from "../helpers/notifications";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";
import { aveniaKycMachine } from "./brlaKyc.machine";
import { AveniaKycContext, MoneriumKycContext, StellarKycContext } from "./kyc.states";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";

export type { RampState } from "../types/phases";
export type GetMessageSignatureCallback = (message: string) => Promise<`0x${string}`>;
export interface RampContext {
  address: string | undefined;
  authToken?: string;
  chainId: number | undefined;
  executionInput: RampExecutionInput | undefined;
  getMessageSignature: GetMessageSignatureCallback | undefined;
  initializeFailedMessage: string | undefined;
  isQuoteExpired: boolean;
  paymentData?: PaymentData;
  partnerId?: string;
  quote: QuoteResponse | undefined;
  quoteId: string | undefined;
  quoteLocked?: boolean;
  rampDirection: RampDirection | undefined;
  rampPaymentConfirmed: boolean;
  rampSigningPhase: RampSigningPhase | undefined;
  rampState: RampState | undefined;
  substrateWalletAccount: WalletAccount | undefined;
  walletLocked?: string;
}

export type RampMachineEvents =
  | { type: "CONFIRM"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
  | { type: "CANCEL_RAMP" }
  | { type: "onDone"; input: RampState }
  | { type: "SET_ADDRESS"; address: string | undefined }
  | { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback | undefined }
  | { type: "SubmitLevel1"; formData: any } // KYCFormData
  | { type: "SummaryConfirm" }
  | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "SET_RAMP_STATE"; rampState: RampState }
  | { type: "RESET_RAMP" }
  | { type: "FINISH_OFFRAMPING" }
  | { type: "SHOW_ERROR_TOAST"; message: ToastMessage }
  | { type: "PROCEED_TO_REGISTRATION" }
  | { type: "SET_QUOTE"; quoteId: string; lock: boolean }
  | { type: "UPDATE_QUOTE"; quote: QuoteResponse }
  | { type: "SET_PARTNER_ID"; partnerId?: string }
  | { type: "SET_INITIALIZE_FAILED_MESSAGE"; message: string | undefined }
  | { type: "EXPIRE_QUOTE" };

export type RampMachineActor = ActorRef<any, RampMachineEvents>;
export type RampMachineSnapshot = SnapshotFrom<RampMachineActor>;

export type StellarKycActorRef = ActorRefFrom<typeof stellarKycMachine>;
export type StellarKycSnapshot = SnapshotFrom<typeof stellarKycMachine>;

export type MoneriumKycActorRef = ActorRefFrom<typeof moneriumKycMachine>;
export type MoneriumKycSnapshot = SnapshotFrom<typeof moneriumKycMachine>;

export type AveniaKycActorRef = ActorRefFrom<typeof aveniaKycMachine>;
export type AveniaKycSnapshot = SnapshotFrom<typeof aveniaKycMachine>;

export type SelectedStellarData = {
  stateValue: StellarKycSnapshot["value"];
  context: StellarKycContext;
};

export type SelectedMoneriumData = {
  stateValue: MoneriumKycSnapshot["value"];
  context: MoneriumKycContext;
};

export type SelectedAveniaData = {
  stateValue: AveniaKycSnapshot["value"];
  context: AveniaKycContext;
};
