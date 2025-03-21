import { BrlaOfframpTransactions, OfframpingState, SpacewalkOfframpTransactions } from '../services/offrampingFlow';
import { OnChainToken, FiatToken } from '../constants/tokenConfig';
import { Networks } from '../helpers/networks';
import { ApiPromise } from '@polkadot/api';
import { OnrampingState } from '../services/onrampingFlow';

export type OfframpSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface OfframpExecutionInput {
  onChainToken: OnChainToken;
  FiatToken: FiatToken;
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
  api: ApiPromise;
  address: string;
  network: Networks;
  requiresSquidRouter: boolean;
  expectedRedeemAmountRaw: string;
  inputAmountRaw: string;
  setInitializeFailed: (message?: string | null) => void;
}

export interface OfframpState {
  offrampStarted: boolean;
  offrampInitiating: boolean;
  offrampState: OfframpingState | OnrampingState | undefined;
  offrampSigningPhase: OfframpSigningPhase | undefined;
  offrampExecutionInput: OfframpExecutionInput | undefined;
  offrampKycStarted: boolean;
  initializeFailedMessage: string | undefined;
  offrampSummaryVisible: boolean;
}

export interface OfframpActions {
  setOfframpStarted: (started: boolean) => void;
  setOfframpInitiating: (initiating: boolean) => void;
  setOfframpState: (state: OfframpingState | undefined) => void;
  setOfframpSigningPhase: (phase: OfframpSigningPhase | undefined) => void;
  setOfframpKycStarted: (kycStarted: boolean) => void;
  setOfframpExecutionInput: (executionInput: OfframpExecutionInput | undefined) => void;
  setInitializeFailedMessage: (message: string | undefined) => void;
  setOfframpSummaryVisible: (visible: boolean) => void;
  updateOfframpHookStateFromState: (state: OfframpingState | OnrampingState | undefined) => void;
  clearInitializeFailedMessage: () => void;
  resetOfframpState: () => void;
}

export function isBrlaOfframpTransactions(tx: any): tx is BrlaOfframpTransactions {
  return (
    tx &&
    typeof tx.nablaApproveTransaction === 'string' &&
    typeof tx.nablaSwapTransaction === 'string' &&
    typeof tx.pendulumToMoonbeamXcmTransaction === 'string'
  );
}

export function isSpacewalkOfframpTransactions(tx: any): tx is SpacewalkOfframpTransactions {
  return (
    tx &&
    typeof tx.nablaApproveTransaction === 'string' &&
    typeof tx.nablaSwapTransaction === 'string' &&
    typeof tx.stellarOfframpingTransaction === 'string' &&
    typeof tx.stellarCleanupTransaction === 'string' &&
    typeof tx.spacewalkRedeemTransaction === 'string'
  );
}
