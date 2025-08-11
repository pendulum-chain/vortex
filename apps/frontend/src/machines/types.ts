import { PaymentData } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { ActorRef, ActorRefFrom, SnapshotFrom } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { ApiComponents } from "../contexts/polkadotNode";
import { UseSiweContext } from "../contexts/siwe";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";
import { MoneriumKycContext, StellarKycContext } from "./kyc.states";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { RampMachineEvents, rampMachine } from "./ramp.machine";
import { stellarKycMachine } from "./stellarKyc.machine";

export type { RampState } from "../types/phases";
export type GetMessageSignatureCallback = (message: string) => Promise<`0x${string}`>;

export interface RampContext {
  stuff?: string;
  authToken?: string;
  paymentData?: PaymentData;
  siwe: UseSiweContext | undefined;
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

export type RampMachineSnapshot = SnapshotFrom<typeof rampMachine>;
export type RampMachineActor = ActorRef<RampMachineSnapshot, RampMachineEvents>;
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
