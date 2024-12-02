import * as Sentry from '@sentry/react';
import { useCallback, useMemo } from 'preact/hooks';
import { Config } from 'wagmi';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';

import { storageService } from './storage/local';
import { getInputTokenDetails, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../constants/tokenConfig';
import { squidRouter } from './squidrouter/process';
import {
  useCreatePendulumEphemeralSeed,
  usePendulumCleanup,
  usePendulumFundEphemeral,
  useSubsidizePostSwap,
  useSubsidizePreSwap,
} from './polkadot/ephemeral';
import { SepResult } from './anchor';
import Big from 'big.js';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { stellarCleanup, stellarOfframp } from './stellar';
import { useNablaApprove, useNablaSwap } from './nabla';
import { RenderEventHandler } from '../components/GenericEvent';
import { useExecuteSpacewalkRedeem } from './polkadot';
import { SigningPhase } from '../hooks/useMainProcess';
import { usePrepareTransactions } from './signedTransactions';
import { createRandomString, createSquidRouterHash } from '../helpers/crypto';
import encodePayload from './squidrouter/payload';
import { useExecuteMoonbeamXCM } from './moonbeam';
import { useExecuteAssethubXCM } from './polkadot/assethub';
import { TrackableEvent } from '../contexts/events';
import { AMM_MINIMUM_OUTPUT_HARD_MARGIN, AMM_MINIMUM_OUTPUT_SOFT_MARGIN } from '../constants/constants';
import { Networks } from '../contexts/network';

const minutesInMs = (minutes: number) => minutes * 60 * 1000;

export interface FailureType {
  type: 'recoverable' | 'unrecoverable';
  message?: string;
}

export type OfframpingPhase =
  | 'prepareTransactions'
  | 'squidRouter'
  | 'pendulumFundEphemeral'
  | 'executeMoonbeamXCM'
  | 'executeAssetHubXCM'
  | 'subsidizePreSwap'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'subsidizePostSwap'
  | 'executeSpacewalkRedeem'
  | 'pendulumCleanup'
  | 'stellarOfframp'
  | 'stellarCleanup';

export type FinalOfframpingPhase = 'success';

export interface OfframpingState {
  sep24Id: string;

  pendulumEphemeralSeed: string;
  stellarEphemeralSecret: string;

  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;

  inputAmount: {
    units: string;
    raw: string;
  };
  outputAmount: {
    units: string;
    raw: string;
  };

  phase: OfframpingPhase | FinalOfframpingPhase;

  failure?: FailureType;

  // phase squidRouter
  squidRouterReceiverId: `0x${string}`;
  squidRouterReceiverHash: `0x${string}`;
  squidRouterApproveHash?: `0x${string}`;
  squidRouterSwapHash?: `0x${string}`;

  // phase executeMoonbeamXCM
  moonbeamXcmTransactionHash?: `0x${string}`;

  // phase executeAssetHubXCM
  assetHubXcmTransactionHash?: string;

  // nabla minimum output amounts
  nablaSoftMinimumOutputRaw: string;
  nablaHardMinimumOutputRaw: string;

  // nablaApprove
  nablaApproveNonce: number;

  // nablaSwap
  nablaSwapNonce: number;

  // executeSpacewalk
  executeSpacewalkNonce: number;

  sepResult: SepResult;

  // Initiating state timestamp
  createdAt: number;
  failureTimeoutAt: number;

  // All signed transactions, if available
  transactions?: {
    stellarOfframpingTransaction: string;
    stellarCleanupTransaction: string;
    spacewalkRedeemTransaction: string;
    nablaApproveTransaction: string;
    nablaSwapTransaction: string;
  };

  network: Networks;
}

export type StateTransitionFunction = (
  state: OfframpingState,
  context: ExecutionContext,
) => Promise<OfframpingState | undefined>;

export interface ExecutionContext {
  wagmiConfig: Config;
  renderEvent: RenderEventHandler;
  setSigningPhase: (n: SigningPhase) => void;
  trackEvent: (event: TrackableEvent) => void;
}

const OFFRAMPING_STATE_LOCAL_STORAGE_KEY = 'offrampingState';

export interface InitiateStateArguments {
  sep24Id: string;
  stellarEphemeralSecret: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountIn: string;
  amountOut: Big;
  sepResult: SepResult;
  network: Networks;
}

export function useOfframpingFlow() {
  const pendulumFundEphemeral = usePendulumFundEphemeral();
  const subsidizePreSwap = useSubsidizePreSwap();
  const subsidizePostSwap = useSubsidizePostSwap();
  const pendulumCleanup = usePendulumCleanup();
  const nablaApprove = useNablaApprove();
  const nablaSwap = useNablaSwap();
  const executeMoonbeamXCM = useExecuteMoonbeamXCM();
  const executeAssetHubXCM = useExecuteAssethubXCM();
  const executeSpacewalkRedeem = useExecuteSpacewalkRedeem();
  const prepareTransactions = usePrepareTransactions();

  const STATE_ADVANCEMENT_HANDLERS = useMemo<
    Record<Networks, Partial<Record<OfframpingPhase, StateTransitionFunction>>>
  >(
    () => ({
      Polygon: {
        prepareTransactions,
        squidRouter,
        pendulumFundEphemeral,
        executeMoonbeamXCM,
        subsidizePreSwap,
        nablaApprove,
        nablaSwap,
        subsidizePostSwap,
        executeSpacewalkRedeem,
        pendulumCleanup,
        stellarOfframp,
        stellarCleanup,
      },
      AssetHub: {
        prepareTransactions,
        pendulumFundEphemeral,
        executeAssetHubXCM,
        subsidizePreSwap,
        nablaApprove,
        nablaSwap,
        subsidizePostSwap,
        executeSpacewalkRedeem,
        pendulumCleanup,
        stellarOfframp,
        stellarCleanup,
      },
    }),
    [
      prepareTransactions,
      pendulumFundEphemeral,
      executeMoonbeamXCM,
      executeAssetHubXCM,
      subsidizePreSwap,
      nablaApprove,
      nablaSwap,
      subsidizePostSwap,
      executeSpacewalkRedeem,
      pendulumCleanup,
    ],
  );

  const createPendulumEphemeralSeed = useCreatePendulumEphemeralSeed();

  const constructInitialState = useCallback(
    async ({
      sep24Id,
      stellarEphemeralSecret,
      inputTokenType,
      outputTokenType,
      amountIn,
      amountOut,
      sepResult,
      network,
    }: InitiateStateArguments) => {
      const { seed: pendulumEphemeralSeed, address: pendulumEphemeralAddress } = await createPendulumEphemeralSeed();

      const inputTokenDecimals = getInputTokenDetails(network, inputTokenType).decimals;
      const outputTokenDecimals = OUTPUT_TOKEN_CONFIG[outputTokenType].decimals;

      const inputAmountBig = Big(amountIn);
      const inputAmountRaw = multiplyByPowerOfTen(inputAmountBig, inputTokenDecimals || 0).toFixed();

      const outputAmountRaw = multiplyByPowerOfTen(amountOut, outputTokenDecimals).toFixed();

      // nabla minimum output amounts
      const nablaHardMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN);
      const nablaSoftMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
      const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(nablaHardMinimumOutput, outputTokenDecimals).toFixed();
      const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(nablaSoftMinimumOutput, outputTokenDecimals).toFixed();

      const squidRouterReceiverId = createRandomString(32);
      const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumEphemeralAddress));
      const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
      const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);

      const now = Date.now();
      const initialState: OfframpingState = {
        sep24Id,
        pendulumEphemeralSeed,
        stellarEphemeralSecret,
        inputTokenType,
        outputTokenType,
        inputAmount: {
          units: amountIn,
          raw: inputAmountRaw,
        },
        outputAmount: {
          units: amountOut.toFixed(2, 0),
          raw: outputAmountRaw,
        },
        phase: 'prepareTransactions',
        squidRouterReceiverId,
        squidRouterReceiverHash,
        nablaHardMinimumOutputRaw,
        nablaSoftMinimumOutputRaw,
        nablaApproveNonce: 0,
        nablaSwapNonce: 1,
        executeSpacewalkNonce: 2,
        createdAt: now,
        failureTimeoutAt: now + minutesInMs(10),
        sepResult,
        network,
        transactions: undefined,
      };

      storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, initialState);
      return initialState;
    },
    [createPendulumEphemeralSeed],
  );

  const clearOfframpingState = useCallback(async () => {
    storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
  }, []);

  const recoverFromFailure = useCallback((state: OfframpingState | undefined) => {
    if (state === undefined) {
      console.log('No offramping in process');
      return undefined;
    }

    if (state.failure !== undefined) {
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
  }, []);

  const readCurrentState = useCallback(() => {
    return storageService.getParsed<OfframpingState>(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
  }, []);

  const advanceOfframpingState = useCallback(
    async (state: OfframpingState | undefined, context: ExecutionContext): Promise<OfframpingState | undefined> => {
      if (state === undefined) {
        console.log('No offramping in process');
        return undefined;
      }

      const { phase, failure } = state;
      const phaseIsFinal = phase === 'success' || failure !== undefined;

      if (phaseIsFinal) {
        console.log('Offramping is already in a final phase:', phase);
        return state;
      }

      console.log('Advance offramping state in phase', phase);

      let newState: OfframpingState | undefined;
      try {
        const nextHandler = STATE_ADVANCEMENT_HANDLERS[state.network][phase];
        if (!nextHandler) {
          throw new Error(`No handler for phase ${phase} on network ${state.network}`);
        }
        newState = await nextHandler(state, context);
        if (newState) {
          Sentry.captureMessage(`Advancing to next offramping phase ${newState.phase}`);
        }
      } catch (error: unknown) {
        if ((error as Error)?.message === 'Wallet not connected') {
          // TODO: transmit error to caller
          console.error('Wallet not connected. Try to connect wallet');
          return state;
        }

        if (Date.now() < state.failureTimeoutAt) {
          console.error('Possible transient error within 10 minutes. Reloading page in 30 seconds.', error);
          await new Promise((resolve) => setTimeout(resolve, 30000));
          window.location.reload();
          return state;
        }

        console.error('Error advancing offramping state', error);
        newState = { ...state, failure: { type: 'recoverable', message: error?.toString() } };
      }

      if (newState !== undefined) {
        storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, newState);
      } else {
        storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
      }

      console.log('Done advancing offramping state and advance to', newState?.phase ?? 'completed');
      return newState;
    },
    [STATE_ADVANCEMENT_HANDLERS],
  );

  return {
    constructInitialState,
    clearOfframpingState,
    recoverFromFailure,
    readCurrentState,
    advanceOfframpingState,
  };
}
