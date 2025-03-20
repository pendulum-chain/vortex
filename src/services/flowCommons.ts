import { OfframpingPhase, OfframpingState, selectNextOfframpStateAdvancementHandler } from './offrampingFlow';
import { WalletAccount } from '@talismn/connect-wallets';
import * as Sentry from '@sentry/react';
import { Config } from 'wagmi';
import { ApiPromise } from '@polkadot/api';

import { OfframpSigningPhase } from '../types/offramp';
import { TrackableEvent } from '../contexts/events';
import { OfframpHandlerType, FailureType as OfframpFailureType } from './offrampingFlow';

import { storageService } from './storage/local';
import { ApiComponents } from '../contexts/polkadotNode';
import { storageKeys } from '../constants/localStorage';
import { isNetworkEVM, Networks } from '../helpers/networks';
import {
  BrlaOnrampingState,
  FailureType as OnrampFailureType,
  OnrampHandlerType,
  OnrampingPhase,
  OnrampOutputTokenType,
  selectNextOnrapStateAdvancementHandler,
} from './onrampingFlow';
import { InputTokenTypes, OutputTokenType, OutputTokenTypes } from '../constants/tokenConfig';

export interface ExecutionContext {
  wagmiConfig: Config;
  setOfframpSigningPhase: (n: OfframpSigningPhase) => void;
  trackEvent: (event: TrackableEvent) => void;
  pendulumNode: ApiComponents;
  assetHubNode: { api: ApiPromise };
  moonbeamNode: ApiComponents;
  walletAccount?: WalletAccount;
}

export type FlowType = OfframpHandlerType | OnrampHandlerType;

export type BaseFlowState = {
  flowType: FlowType;
  network: Networks;
  failure?: OfframpFailureType | OnrampFailureType;
  failureTimeoutAt: number;
  phase: OnrampingPhase | OfframpingPhase | FinalPhase;
};

export type StateTransitionFunction<T extends BaseFlowState> = (
  state: T,
  context: ExecutionContext,
) => Promise<T | undefined>;

export const OFFRAMPING_STATE_LOCAL_STORAGE_KEY = 'offrampingState';
export const minutesInMs = (minutes: number) => minutes * 60 * 1000;

export type FinalPhase = 'success';

export function isOnrampFlow(flowType: FlowType): flowType is OnrampHandlerType {
  return Object.values(OnrampHandlerType).includes(flowType as OnrampHandlerType);
}

function selectNextStateAdvancementHandler(state: BaseFlowState, phase: OfframpingPhase | OnrampingPhase): unknown {
  if (Object.values(OnrampHandlerType).includes(state.flowType as OnrampHandlerType)) {
    return selectNextOnrapStateAdvancementHandler(state.network, phase as OnrampingPhase);
  } else {
    return selectNextOfframpStateAdvancementHandler(state.flowType as OfframpHandlerType, phase as OfframpingPhase);
  }
}

export const clearOfframpingState = () => {
  storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
  storageService.remove(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX);
};

export const recoverFromFailure = (state: OfframpingState | BrlaOnrampingState | undefined) => {
  if (!state) {
    console.log('No offramping in process');
    return undefined;
  }

  if (state.failure === undefined) {
    console.log('Current state is not a failure.');
    return state;
  }

  const newState = {
    ...state,
    failure: undefined,
    failureTimeoutAt: Date.now() + minutesInMs(5),
  };
  storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, newState);
  console.log('Recovered from failure');
  return newState;
};

export const readCurrentState = () => {
  return storageService.getParsed<OfframpingState>(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
};

export const advanceOfframpingState = async (
  state: BaseFlowState | undefined,
  context: ExecutionContext,
): Promise<BaseFlowState | undefined> => {
  if (!state) {
    console.log('No offramping in process');
    return undefined;
  }

  const { phase, failure } = state;
  const phaseIsFinal = phase === 'success' || failure !== undefined;

  if (phaseIsFinal) {
    console.log('Offramping is already in a final phase:', phase);
    return state;
  }

  console.log('Trying to advance offramping state from current phase', phase);

  let newState: BaseFlowState | undefined;
  try {
    storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, { ...state, currentPhaseInProgress: true });

    // TODO improve this typing
    if (Object.values(OnrampHandlerType).includes(state.flowType as OnrampHandlerType)) {
      const nextHandler = selectNextOnrapStateAdvancementHandler(state.network, phase as OnrampingPhase);
      if (!nextHandler) {
        throw new Error(`No handler for phase ${phase} on network ${state.network}`);
      }
      newState = await nextHandler(state as BrlaOnrampingState, context);
    } else {
      const nextHandler = selectNextOfframpStateAdvancementHandler(
        state.flowType as OfframpHandlerType,
        phase as OfframpingPhase,
      );
      if (!nextHandler) {
        throw new Error(`No handler for phase ${phase} on network ${state.network}`);
      }
      newState = await nextHandler(state as OfframpingState, context);
    }

    if (newState) {
      Sentry.captureMessage(`Advancing to next offramping phase ${newState.phase}`);
    }
  } catch (error: unknown) {
    if ((error as Error)?.message === 'Wallet not connected') {
      console.error('Wallet not connected. Try to connect wallet');
      return state;
    }

    if (Date.now() < state.failureTimeoutAt) {
      console.error('Possible transient error within 10 minutes. Reloading page in 30 seconds.', error);
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Since we are reloading, we cannot rely on useOfframpAdvancement to properly update that the state is not in progress.
      window.location.reload();
      return state;
    }

    console.error('Error advancing offramping state', error);
    newState = {
      ...state,
      failure: {
        type: 'recoverable',
        message: error?.toString(),
      },
    };
  }

  if (newState) {
    storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, newState);
  } else {
    storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
  }

  console.log('Done advancing offramping state and advance to', newState?.phase ?? 'completed');
  return newState;
};
