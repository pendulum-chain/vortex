import { WalletAccount } from "@talismn/connect-wallets";
import { RampDirection } from "../components/RampToggle";
import { ApiComponents } from "../contexts/polkadotNode";
import { UseSiweContext } from "../contexts/siwe";
import { RampExecutionInput, RampSigningPhase, RampState } from "../types/phases";

export type { RampState } from "../types/phases";

export interface RampContext {
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
  rampExecutionInput: RampExecutionInput | undefined;
  rampKycStarted: boolean;
  rampKycLevel2Started: boolean;
  rampPaymentConfirmed: boolean;
  initializeFailedMessage: string | undefined;
  rampSummaryVisible: boolean;
  canRegisterRamp: boolean;
  signingRejected: boolean;
  executionInput: RampExecutionInput | undefined;
  getMessageSignature: ((message: string) => Promise<string>) | undefined;
  substrateWalletAccount: WalletAccount | undefined;
}
