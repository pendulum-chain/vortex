import Big from 'big.js';
import { isNetworkEVM, Networks } from '../helpers/networks';

import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../constants/tokenConfig';
import { AMM_MINIMUM_OUTPUT_HARD_MARGIN, AMM_MINIMUM_OUTPUT_SOFT_MARGIN } from '../constants/constants';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../helpers/contracts';

import { createMoonbeamEphemeralSeed, executeMoonbeamToPendulumXCM } from './phases/moonbeam';

import { createPendulumEphemeralSeed } from './phases/polkadot/ephemeral';
import { ApiComponents } from '../contexts/polkadotNode';
import { StateTransitionFunction, FinalPhase, minutesInMs } from './flowCommons';

export interface FailureType {
  type: 'recoverable' | 'unrecoverable';
  message?: string;
}

export type OnrampingPhase =
  | 'prepareOnrampTransactions'
  | 'createPayInRequest'
  | 'teleportFromPolygonToMoonbeam'
  | 'executeMoonbeamToPendulumXCM'
  | 'subsidizePreSwap'
  | 'nablaApprove'
  | 'nablaSwap'
  | 'subsidizePostSwap'
  | 'executePendulumToAssetHubXCM'
  | 'executePendulumToMoonbeamXCM'
  | 'squidRouter';

export type OnrampInputTokenType = OutputTokenType;
export type OnrampOutputTokenType = InputTokenType;

export interface BrlaOnrampInitiateStateArguments {
  inputTokenType: OnrampInputTokenType;
  outputTokenType: OnrampOutputTokenType;
  amountIn: string;
  amountOut: Big;
  network: Networks;
  networkId: number;
  toNetwork: Networks;
  pendulumNode: ApiComponents;
  moonbeamNode: ApiComponents;
  brlaEvmAddress: string;
  addressDestination: string;
  taxId: string;
}

export interface BrlaOnrampingState {
  flowType: OnrampHandlerType;
  moonbeamEphemeralSeed: string;
  moonbeamEphemeralAddress: string;
  pendulumEphemeralSeed: string;
  pendulumEphemeralAddress: string;
  inputTokenType: OnrampInputTokenType;
  outputTokenType: OnrampOutputTokenType;
  effectiveExchangeRate: string;
  inputAmount: { units: string; raw: string };
  pendulumAmountRaw: string;
  outputAmount: { units: string; raw: string };
  phase: OnrampingPhase | FinalPhase;
  failure?: FailureType;
  squidRouterApproveHash?: `0x${string}`;
  squidRouterSwapHash?: `0x${string}`;
  nablaSoftMinimumOutputRaw: string;
  nablaHardMinimumOutputRaw: string;
  nablaApproveNonce: number;
  nablaSwapNonce: number;
  createdAt: number;
  failureTimeoutAt: number;
  network: Networks;
  networkId: number;
  toNetwork: Networks;
  transactions?: BrlaOnrampTransactions;
  brlaEvmAddress?: string;
  addressDestination: string;
  taxId?: string;
}

export type BrlaOnrampTransactions = {
  nablaApproveTransaction: string;
  nablaSwapTransaction: string;
  pendulumToMoonbeamXcmTransaction: string;
  moonbeamToPendulumXcmTransaction: string;
  squidrouterApproveTransaction: string;
  squidrouterSwapTransaction: string;
  pendulumToAssetHubXcmTransaction: string;
};

export enum OnrampHandlerType {
  BRLA_TO_EVM = 'brla-to-evm',
  BRLA_TO_ASSETHUB = 'brla-to-assethub',
}

// TODO fill with actual phase functions.
export const ONRAMP_STATE_ADVANCEMENT_HANDLERS: Record<
  OnrampHandlerType,
  Partial<Record<OnrampingPhase, StateTransitionFunction>>
> = {
  [OnrampHandlerType.BRLA_TO_EVM]: {},
  [OnrampHandlerType.BRLA_TO_ASSETHUB]: {},
};

export function selectNextOnrapStateAdvancementHandler(
  network: Networks,
  phase: OnrampingPhase,
): StateTransitionFunction | undefined {
  if (isNetworkEVM(network)) {
    return ONRAMP_STATE_ADVANCEMENT_HANDLERS[OnrampHandlerType.BRLA_TO_EVM][phase];
  } else {
    return ONRAMP_STATE_ADVANCEMENT_HANDLERS[OnrampHandlerType.BRLA_TO_ASSETHUB][phase];
  }
}

export async function constructBrlaOnrampInitialState({
  inputTokenType,
  outputTokenType,
  amountIn,
  amountOut,
  network,
  networkId,
  pendulumNode,
  moonbeamNode,
  addressDestination,
  taxId,
}: BrlaOnrampInitiateStateArguments): Promise<BrlaOnrampingState> {
  const { seed: pendulumEphemeralSeed, address: pendulumEphemeralAddress } = await createPendulumEphemeralSeed(
    pendulumNode,
  );

  const { seed: moonbeamEphemeralSeed, address: moonbeamEphemeralAddress } = await createMoonbeamEphemeralSeed(
    moonbeamNode,
  );

  const { decimals: inputTokenDecimals } = OUTPUT_TOKEN_CONFIG[inputTokenType];

  const outputToken = Object.entries(INPUT_TOKEN_CONFIG[network]).find(([key, value]) => key === outputTokenType);
  if (!outputToken) {
    throw new Error(`Output token ${outputTokenType} not found in token config`);
  }

  const { decimals: outputTokenDecimals } = outputToken[1];

  const inputAmountBig = Big(amountIn);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountBig, inputTokenDecimals || 0).toFixed();
  const pendulumAmountRaw = multiplyByPowerOfTen(inputAmountBig, inputTokenDecimals || 0).toFixed();

  const outputAmountRaw = multiplyByPowerOfTen(amountOut, outputTokenDecimals).toFixed();

  const effectiveExchangeRate = stringifyBigWithSignificantDecimals(amountOut.div(inputAmountBig), 4);

  const nablaHardMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN);
  const nablaSoftMinimumOutput = amountOut.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
  const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(nablaHardMinimumOutput, outputTokenDecimals).toFixed();
  const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(nablaSoftMinimumOutput, outputTokenDecimals).toFixed();

  const now = Date.now();

  return {
    flowType: isNetworkEVM(network) ? OnrampHandlerType.BRLA_TO_EVM : OnrampHandlerType.BRLA_TO_ASSETHUB,
    moonbeamEphemeralSeed,
    moonbeamEphemeralAddress,
    pendulumEphemeralSeed,
    pendulumEphemeralAddress,
    effectiveExchangeRate,
    nablaHardMinimumOutputRaw,
    nablaSoftMinimumOutputRaw,
    outputAmount: { units: amountOut.toFixed(2, 0), raw: outputAmountRaw },
    pendulumAmountRaw,
    inputAmount: { units: amountIn, raw: inputAmountRaw },
    inputTokenType,
    outputTokenType,
    phase: 'prepareOnrampTransactions',
    nablaApproveNonce: 0,
    nablaSwapNonce: 1,
    createdAt: Date.now(),
    failureTimeoutAt: now + minutesInMs(10),
    network,
    networkId,
    toNetwork: network,
    taxId,
    addressDestination,
  };
}
