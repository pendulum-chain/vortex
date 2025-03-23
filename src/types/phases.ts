import { FiatToken, OnChainToken } from '../constants/tokenConfig';
import { Networks } from '../helpers/networks';

export type RampingPhase =
  | 'prepareTransactions'
  | 'squidRouter'
  | 'pendulumFundEphemeral'
  | 'executeMoonbeamToPendulumXCM'
  | 'executeAssetHubToPendulumXCM'
  | 'subsidizePreSwap'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'subsidizePostSwap'
  | 'executePendulumToMoonbeamXCM'
  | 'executeSpacewalkRedeem'
  | 'pendulumCleanup'
  | 'stellarOfframp'
  | 'stellarCleanup'
  | 'performBrlaPayoutOnMoonbeam';

export type RampSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface RampingState {
  type: 'on' | 'off';
  phase: RampingPhase | 'success';
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  failure: string;
  inputAmount: {
    units: string;
    raw: string;
  };
  outputAmount: {
    units: string;
  };
}

export interface RampExecutionInput {
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  inputAmountUnits: string;
  outputAmountUnits: {
    beforeFees: string;
    afterFees: string;
  };
  effectiveExchangeRate: string;
  stellarEphemeralSecret?: string;
  taxId?: string;
  pixId?: string;
  brlaEvmAddress?: string;
  address: string;
  network: Networks;
  requiresSquidRouter: boolean;
  expectedRedeemAmountRaw: string;
  inputAmountRaw: string;
  setInitializeFailed: (message?: string | null) => void;
}

export interface RampZustand {
  rampStarted: boolean;
  rampInitiating: boolean;
  rampState: RampingState | undefined;
  rampSigningPhase: RampSigningPhase | undefined;
  rampExecutionInput: RampExecutionInput | undefined;
  rampKycStarted: boolean;
  initializeFailedMessage: string | undefined;
  rampSummaryVisible: boolean;
}

export interface RampActions {
  setRampStarted: (started: boolean) => void;
  setRampInitiating: (initiating: boolean) => void;
  setRampState: (state: RampingState | undefined) => void;
  setRampSigningPhase: (phase: RampSigningPhase | undefined) => void;
  setRampKycStarted: (kycStarted: boolean) => void;
  setRampExecutionInput: (executionInput: RampExecutionInput | undefined) => void;
  setInitializeFailedMessage: (message: string | undefined) => void;
  setRampSummaryVisible: (visible: boolean) => void;
  clearInitializeFailedMessage: () => void;
  resetRampState: () => void;
}
