import { PaymentData } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { ActorRef, ActorRefFrom, EventObject, SnapshotFrom } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";
import { MoneriumKycContext, StellarKycContext } from "./kyc.states";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";

export type { RampState } from "../types/phases";
export type GetMessageSignatureCallback = (message: string) => Promise<`0x${string}`>;
export interface RampContext {
  stuff?: string;
  authToken?: string;
  paymentData?: PaymentData;
  address: string | undefined;
  chainId: number | undefined;
  rampDirection: RampDirection | undefined;
  rampState: RampState | undefined;
  rampSigningPhase: RampSigningPhase | undefined;
  executionInput: RampExecutionInput | undefined;
  rampKycStarted: boolean;
  rampKycLevel2Started: boolean;
  rampPaymentConfirmed: boolean;
  initializeFailedMessage: string | undefined;
  rampSummaryVisible: boolean;
  getMessageSignature: GetMessageSignatureCallback | undefined;
  substrateWalletAccount: WalletAccount | undefined;
  isQuoteExpired: boolean;
}

export type RampMachineEvents =
  | { type: "Confirm"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
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
  | { type: "SHOW_ERROR_TOAST"; message: string };

export type RampMachineActor = ActorRef<any, RampMachineEvents>;
export type RampMachineSnapshot = SnapshotFrom<RampMachineActor>;
export type StellarKycActorRef = ActorRefFrom<typeof stellarKycMachine>;
export type StellarKycSnapshot = SnapshotFrom<typeof stellarKycMachine>;

export type MoneriumKycActorRef = ActorRefFrom<typeof moneriumKycMachine>;
export type MoneriumKycSnapshot = SnapshotFrom<typeof moneriumKycMachine>;

export type SelectedStellarData = {
  stateValue: StellarKycSnapshot["value"];
  context: StellarKycContext;
};

export type SelectedMoneriumData = {
  stateValue: MoneriumKycSnapshot["value"];
  context: MoneriumKycContext;
};
