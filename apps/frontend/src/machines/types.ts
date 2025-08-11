import { PaymentData } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { RampDirection } from "../components/RampToggle";
import { ApiComponents } from "../contexts/polkadotNode";
import { UseSiweContext } from "../contexts/siwe";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";

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
