import { Config } from 'wagmi';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../constants/tokenConfig';
import { squidRouter } from './squidrouter/process';
import { createPendulumEphemeralSeed, pendulumCleanup, pendulumFundEphemeral } from './polkadot/ephemeral';
import { SepResult, createStellarEphemeralSecret } from './anchor';
import Big from 'big.js';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { setUpAccountAndOperations, stellarCleanup, stellarCreateEphemeral, stellarOfframp } from './stellar';
import { nablaApprove, nablaSwap } from './nabla';
import { RenderEventHandler } from '../components/GenericEvent';
import { executeSpacewalkRedeem } from './polkadot';
import { fetchSigningServiceAccountId } from './signingService';
import { Keypair } from 'stellar-sdk';
import { storageService } from './storage/local';
import { SigningPhase } from '../hooks/useMainProcess';

export type OfframpingPhase =
  | 'squidRouter'
  | 'pendulumFundEphemeral'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'executeSpacewalkRedeem'
  | 'pendulumCleanup'
  | 'stellarOfframp'
  | 'stellarCleanup';

export type FinalOfframpingPhase = 'success' | 'failure';

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
  inputAmountNabla: {
    units: string;
    raw: string;
  };
  outputAmount: {
    units: string;
    raw: string;
  };

  phase: OfframpingPhase | FinalOfframpingPhase;

  // phase squidRouter
  squidRouterApproveHash?: `0x${string}`;
  squidRouterSwapHash?: `0x${string}`;

  // nablaApprove
  nablaApproveNonce: number;

  // nablaSwap
  nablaSwapNonce: number;

  // executeSpacewalk
  executeSpacewalkNonce: number;

  // stellarOfframp
  stellarOfframpingTransaction: string;

  // stellarCleanup
  stellarCleanupTransaction: string;
}

export type StateTransitionFunction = (
  state: OfframpingState,
  context: ExecutionContext,
) => Promise<OfframpingState | undefined>;

const STATE_ADVANCEMENT_HANDLERS: Record<OfframpingPhase, StateTransitionFunction> = {
  squidRouter,
  pendulumFundEphemeral,
  nablaApprove,
  nablaSwap,
  executeSpacewalkRedeem,
  pendulumCleanup,
  stellarOfframp,
  stellarCleanup,
};

export interface ExecutionContext {
  wagmiConfig: Config;
  renderEvent: RenderEventHandler;
  setSigningPhase?: (n: SigningPhase) => void;
}

const OFFRAMPING_STATE_LOCAL_STORAGE_KEY = 'offrampingState';

export interface InitiateStateArguments {
  sep24Id: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountIn: string;
  nablaAmountInRaw: string;
  amountOut: string;
  sepResult: SepResult;
}

export async function constructInitialState({
  sep24Id,
  inputTokenType,
  outputTokenType,
  amountIn,
  nablaAmountInRaw,
  amountOut,
  sepResult,
}: InitiateStateArguments) {
  const pendulumEphemeralSeed = await createPendulumEphemeralSeed();
  const stellarEphemeralSecret = createStellarEphemeralSecret();

  const inputTokenDecimals = INPUT_TOKEN_CONFIG[inputTokenType].decimals;
  const outputTokenDecimals = OUTPUT_TOKEN_CONFIG[outputTokenType].decimals;

  const inputAmountBig = Big(amountIn);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountBig, inputTokenDecimals).toFixed();

  const inputAmountNablaRawBig = Big(nablaAmountInRaw);
  const inputAmountNablaUnits = multiplyByPowerOfTen(inputAmountNablaRawBig, -inputTokenDecimals).toFixed();

  const outputAmountBig = Big(amountOut).round(2, 0);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmountBig, outputTokenDecimals).toFixed();

  await stellarCreateEphemeral(stellarEphemeralSecret, outputTokenType);
  const stellarFundingAccountId = await fetchSigningServiceAccountId();
  const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
  const { offrampingTransaction, mergeAccountTransaction } = await setUpAccountAndOperations(
    stellarFundingAccountId,
    stellarEphemeralKeypair,
    sepResult,
    outputTokenType,
  );

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
    inputAmountNabla: {
      units: inputAmountNablaUnits,
      raw: nablaAmountInRaw,
    },
    outputAmount: {
      units: outputAmountBig.toFixed(2, 0),
      raw: outputAmountRaw,
    },
    phase: 'squidRouter',
    nablaApproveNonce: 0,
    nablaSwapNonce: 1,
    executeSpacewalkNonce: 2,

    stellarOfframpingTransaction: offrampingTransaction.toEnvelope().toXDR().toString('base64'),
    stellarCleanupTransaction: mergeAccountTransaction.toEnvelope().toXDR().toString('base64'),
  };

  storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, initialState);
  return initialState;
}

export async function clearOfframpingState() {
  storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
}

export function readCurrentState() {
  return storageService.getParsed<OfframpingState>(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
}

export async function advanceOfframpingState(context: ExecutionContext): Promise<OfframpingState | undefined> {
  const state = readCurrentState();

  if (state === undefined) {
    console.log('No offramping in process');
    return undefined;
  }

  const { phase } = state;
  const phaseIsFinal = phase === 'success' || phase === 'failure';

  if (phaseIsFinal) {
    console.log('Offramping is already in a final phase:', phase);
    return state;
  }

  console.log('Advance offramping state in phase', phase);

  let newState: OfframpingState | undefined;
  try {
    newState = await STATE_ADVANCEMENT_HANDLERS[phase](state, context);
  } catch (error: unknown) {
    if ((error as Error)?.message === 'Wallet not connected') {
      // TODO: transmit error to caller
      console.error('Wallet not connected. Try to connect wallet');
      return state;
    }
    console.error('Unrecoverable error advancing offramping state', error);
    newState = { ...state, phase: 'failure' };
  }

  if (newState !== undefined) {
    storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, newState);
  } else {
    storageService.remove(OFFRAMPING_STATE_LOCAL_STORAGE_KEY);
  }

  console.log('Done advancing offramping state and advance to', newState?.phase ?? 'completed');
  return newState;
}
