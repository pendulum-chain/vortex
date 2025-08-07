import { WalletAccount } from "@talismn/connect-wallets";
import { RampDirection } from "../components/RampToggle";
import { ApiComponents } from "../contexts/polkadotNode";
import { UseSiweContext } from "../contexts/siwe";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";

export type { RampState } from "../types/phases";
export type GetMessageSignatureCallback = (message: string) => Promise<`0x${string}`>;

export interface RampContext {
  kycResponse: any;
  siwe: UseSiweContext | undefined;
  address: string | undefined;
  authToken: string | undefined;
  chainId: number | undefined;
  rampDirection: RampDirection | undefined;
  pendulumApiComponents: ApiComponents | undefined;
  moonbeamApiComponents: ApiComponents | undefined;
  assethubApiComponents: ApiComponents | undefined;
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
