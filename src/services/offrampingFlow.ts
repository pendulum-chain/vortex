import { WalletAccount } from '@talismn/connect-wallets';
import * as Sentry from '@sentry/react';
import { Config } from 'wagmi';
import Big from 'big.js';

import { decodeAddress } from '@polkadot/util-crypto';
import { ApiPromise } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';

import { OfframpSigningPhase } from '../types/offramp';
import { TrackableEvent } from '../contexts/events';
import { isNetworkEVM, Networks } from '../helpers/networks';
import { SepResult } from '../types/sep';

import {
  getInputTokenDetailsOrDefault,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
} from '../constants/tokenConfig';
import { AMM_MINIMUM_OUTPUT_HARD_MARGIN, AMM_MINIMUM_OUTPUT_SOFT_MARGIN } from '../constants/constants';

import { createRandomString, createSquidRouterHash } from '../helpers/crypto';
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { storageService } from './storage/local';

import encodePayload from './phases/squidrouter/payload';
import { squidRouter } from './phases/squidrouter/process';
import { prepareTransactions } from './phases/signedTransactions';
import { stellarCleanup, stellarOfframp } from './phases/stellar';
import { executeMoonbeamToPendulumXCM } from './phases/moonbeam';
import { nablaApprove, nablaSwap } from './phases/nabla';
import { executeAssetHubToPendulumXCM } from './phases/polkadot/xcm/assethub';
import { executePendulumToMoonbeamXCM } from './phases/polkadot/xcm/moonbeam';
import { executeSpacewalkRedeem } from './phases/polkadot';
import { performBrlaPayoutOnMoonbeam } from './phases/brla';

import {
  pendulumFundEphemeral,
  subsidizePreSwap,
  subsidizePostSwap,
  pendulumCleanup,
  createPendulumEphemeralSeed,
} from './phases/polkadot/ephemeral';

export interface FailureType {
  type: 'recoverable' | 'unrecoverable';
  message?: string;
}

export type OfframpingPhase =
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

export type FinalOfframpingPhase = 'success';

export interface ExecutionContext {
  wagmiConfig: Config;
  setOfframpSigningPhase: (n: OfframpSigningPhase) => void;
  trackEvent: (event: TrackableEvent) => void;
  pendulumNode: { ss58Format: number; api: ApiPromise; decimals: number };
  assetHubNode: { api: ApiPromise };
  walletAccount?: WalletAccount;
}

//TODO maybe change later to SpacewalkInitialStateArguments
export interface InitiateStateArguments {
  sep24Id: string;
  stellarEphemeralSecret: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountIn: string;
  amountOut: Big;
  sepResult: SepResult;
  network: Networks;
  pendulumNode: { ss58Format: number; api: ApiPromise; decimals: number };
  offramperAddress: string;
}

export interface BrlaInitiateStateArguments {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountIn: string;
  amountOut: Big;
  network: Networks;
  pendulumNode: { ss58Format: number; api: ApiPromise; decimals: number };
  offramperAddress: string;
  brlaEvmAddress: string;
  pixDestination: string;
}

export interface BaseOfframpingState {
  pendulumEphemeralSeed: string;
  pendulumEphemeralAddress: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  effectiveExchangeRate: string;
  inputAmount: { units: string; raw: string };
  pendulumAmountRaw: string;
  outputAmount: { units: string; raw: string };
  phase: OfframpingPhase | FinalOfframpingPhase;
  failure?: FailureType;
  squidRouterReceiverId: `0x${string}`;
  squidRouterReceiverHash: `0x${string}`;
  squidRouterApproveHash?: `0x${string}`;
  squidRouterSwapHash?: `0x${string}`;
  moonbeamXcmTransactionHash?: `0x${string}`;
  assetHubXcmTransactionHash?: string;
  nablaSoftMinimumOutputRaw: string;
  nablaHardMinimumOutputRaw: string;
  nablaApproveNonce: number;
  nablaSwapNonce: number;
  createdAt: number;
  failureTimeoutAt: number;
  network: Networks;
  offramperAddress: string;
}

export interface OfframpingState extends BaseOfframpingState {
  sep24Id?: string;
  sepResult?: SepResult;
  stellarEphemeralSecret?: string;
  executeSpacewalkNonce?: number;
  transactions?: {
    stellarOfframpingTransaction: string;
    stellarCleanupTransaction: string;
    spacewalkRedeemTransaction: string;
    nablaApproveTransaction: string;
    nablaSwapTransaction: string;
    pendulumToMoonbeamXcmTransaction?: string;
  };
  brlaEvmAddress?: string;
  pixDestination?: string;
}

export type StateTransitionFunction = (
  state: OfframpingState,
  context: ExecutionContext,
) => Promise<OfframpingState | undefined>;

// Constants
const OFFRAMPING_STATE_LOCAL_STORAGE_KEY = 'offrampingState';
const minutesInMs = (minutes: number) => minutes * 60 * 1000;

enum HandlerType {
  SQUIDROUTER = 'squidrouter',
  XCM = 'xcm',
  BRLA = 'brla',
}

const STATE_ADVANCEMENT_HANDLERS: Record<HandlerType, Partial<Record<OfframpingPhase, StateTransitionFunction>>> = {
  [HandlerType.SQUIDROUTER]: {
    prepareTransactions,
    squidRouter,
    pendulumFundEphemeral,
    executeMoonbeamToPendulumXCM,
    subsidizePreSwap,
    nablaApprove,
    nablaSwap,
    subsidizePostSwap,
    executeSpacewalkRedeem,
    pendulumCleanup,
    stellarOfframp,
    stellarCleanup,
  },
  [HandlerType.XCM]: {
    prepareTransactions,
    pendulumFundEphemeral,
    executeAssetHubToPendulumXCM,
    subsidizePreSwap,
    nablaApprove,
    nablaSwap,
    subsidizePostSwap,
    executeSpacewalkRedeem,
    pendulumCleanup,
    stellarOfframp,
    stellarCleanup,
  },
  [HandlerType.BRLA]: {
    prepareTransactions,
    pendulumFundEphemeral,
    executeAssetHubToPendulumXCM,
    subsidizePreSwap,
    nablaApprove,
    nablaSwap,
    subsidizePostSwap,
    executePendulumToMoonbeamXCM,
    pendulumCleanup,
    performBrlaPayoutOnMoonbeam,
  },
};

function selectNextStateAdvancementHandler(
  network: Networks,
  phase: OfframpingPhase,
  outToken: OutputTokenType,
): StateTransitionFunction | undefined {
  if (isNetworkEVM(network)) {
    if (outToken === 'brl') {
      return STATE_ADVANCEMENT_HANDLERS[HandlerType.BRLA][phase];
    }
    return STATE_ADVANCEMENT_HANDLERS[HandlerType.SQUIDROUTER][phase];
  }
  return STATE_ADVANCEMENT_HANDLERS[HandlerType.XCM][phase];
}

async function constructBaseInitialState({
  inputTokenType,
  outputTokenType,
  amountIn,
  amountOut,
  network,
  pendulumNode,
  offramperAddress,
}: {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountIn: string;
  amountOut: Big;
  network: Networks;
  pendulumNode: { ss58Format: number; api: ApiPromise; decimals: number };
  offramperAddress: string;
}): Promise<BaseOfframpingState> {
  const { seed: pendulumEphemeralSeed, address: pendulumEphemeralAddress } = await createPendulumEphemeralSeed(
    pendulumNode,
  );

  const { decimals: inputTokenDecimals, pendulumDecimals } = getInputTokenDetailsOrDefault(network, inputTokenType);
  const outputTokenDecimals = OUTPUT_TOKEN_CONFIG[outputTokenType].decimals;

  const inputAmountBig = Big(amountIn);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountBig, inputTokenDecimals || 0).toFixed();
  const pendulumAmountRaw = multiplyByPowerOfTen(inputAmountBig, pendulumDecimals || 0).toFixed();

  const outputAmountRaw = multiplyByPowerOfTen(amountOut, outputTokenDecimals).toFixed();

  const effectiveExchangeRate = stringifyBigWithSignificantDecimals(amountOut.div(inputAmountBig), 4);

  const nablaHardMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN);
  const nablaSoftMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
  const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(nablaHardMinimumOutput, outputTokenDecimals).toFixed();
  const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(nablaSoftMinimumOutput, outputTokenDecimals).toFixed();

  const squidRouterReceiverId = createRandomString(32);
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumEphemeralAddress));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);

  const now = Date.now();

  return {
    pendulumEphemeralSeed,
    inputTokenType,
    outputTokenType,
    effectiveExchangeRate,
    inputAmount: { units: amountIn, raw: inputAmountRaw },
    pendulumAmountRaw,
    outputAmount: { units: amountOut.toFixed(2, 0), raw: outputAmountRaw },
    phase: 'prepareTransactions',
    squidRouterReceiverId,
    squidRouterReceiverHash,
    nablaHardMinimumOutputRaw,
    nablaSoftMinimumOutputRaw,
    nablaApproveNonce: 0,
    nablaSwapNonce: 1,
    createdAt: now,
    failureTimeoutAt: now + minutesInMs(10),
    network,
    pendulumEphemeralAddress,
    offramperAddress,
  };
}

export async function constructInitialState({
  sep24Id,
  stellarEphemeralSecret,
  inputTokenType,
  outputTokenType,
  amountIn,
  amountOut,
  sepResult,
  network,
  pendulumNode,
  offramperAddress,
}: InitiateStateArguments) {
  const baseState = await constructBaseInitialState({
    inputTokenType,
    outputTokenType,
    amountIn,
    amountOut,
    network,
    pendulumNode,
    offramperAddress,
  });

  const completeState: Partial<OfframpingState> = {
    ...baseState,
    sep24Id,
    stellarEphemeralSecret,
    sepResult,
    executeSpacewalkNonce: 2,
  };

  storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, completeState);
  return completeState;
}

export async function constructBrlaInitialState({
  inputTokenType,
  outputTokenType,
  amountIn,
  amountOut,
  network,
  pendulumNode,
  offramperAddress,
  brlaEvmAddress,
  pixDestination,
}: BrlaInitiateStateArguments) {
  const baseState = await constructBaseInitialState({
    inputTokenType,
    outputTokenType,
    amountIn,
    amountOut,
    network,
    pendulumNode,
    offramperAddress,
  });

  const completeState: OfframpingState = {
    ...baseState,
    brlaEvmAddress,
    pixDestination,
  };

  storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, completeState);
  return completeState;
}

export const clearOfframpingState = () => {
  storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
};

export const recoverFromFailure = (state: OfframpingState | undefined) => {
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
  state: OfframpingState | undefined,
  context: ExecutionContext,
): Promise<OfframpingState | undefined> => {
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

  console.log('Advance offramping state in phase', phase);

  let newState: OfframpingState | undefined;
  try {
    const nextHandler = selectNextStateAdvancementHandler(state.network, phase, state.outputTokenType);
    if (!nextHandler) {
      throw new Error(`No handler for phase ${phase} on network ${state.network}`);
    }
    newState = await nextHandler(state, context);
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
