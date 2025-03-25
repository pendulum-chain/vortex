export enum OfframpHandlerType {
  EVM_TO_STELLAR = 'evm-to-stellar',
  ASSETHUB_TO_STELLAR = 'assethub-to-stellar',
  EVM_TO_BRLA = 'evm-to-brla',
  ASSETHUB_TO_BRLA = 'assethub-to-brla',
}

export enum OnrampHandlerType {
  BRLA_TO_EVM = 'brla-to-evm',
  BRLA_TO_ASSETHUB = 'brla-to-assethub',
}

// TODO fill with actual phase functions.
export const ONRAMP_STATE_ADVANCEMENT_HANDLERS: Record<OnrampHandlerType, string[]> = {
  [OnrampHandlerType.BRLA_TO_EVM]: [
    'prepareOnrampTransactions',
    'pendulumCleanup',
    // .
  ],
  [OnrampHandlerType.BRLA_TO_ASSETHUB]: [
    'prepareOnrampTransactions',
    'pendulumCleanup',
    // ....
  ],
};

export const OFFRAMP_STATE_ADVANCEMENT_HANDLERS: Record<OfframpHandlerType, string[]> = {
  [OfframpHandlerType.EVM_TO_STELLAR]: [
    'prepareTransactions',
    'squidRouter',
    'pendulumFundEphemeral',
    'executeMoonbeamToPendulumXCM',
    'subsidizePreSwap',
    'nablaApprove',
    'nablaSwap',
    'subsidizePostSwap',
    'executeSpacewalkRedeem',
    'pendulumCleanup',
    'stellarOfframp',
    'stellarCleanup',
  ],
  [OfframpHandlerType.ASSETHUB_TO_STELLAR]: [
    'prepareTransactions',
    'pendulumFundEphemeral',
    'executeAssetHubToPendulumXCM',
    'subsidizePreSwap',
    'nablaApprove',
    'nablaSwap',
    'subsidizePostSwap',
    'executeSpacewalkRedeem',
    'pendulumCleanup',
    'stellarOfframp',
    'stellarCleanup',
  ],
  [OfframpHandlerType.EVM_TO_BRLA]: [
    'prepareTransactions',
    'squidRouter',
    'pendulumFundEphemeral',
    'executeMoonbeamToPendulumXCM',
    'subsidizePreSwap',
    'nablaApprove',
    'nablaSwap',
    'subsidizePostSwap',
    'executePendulumToMoonbeamXCM',
    'performBrlaPayoutOnMoonbeam',
    'pendulumCleanup',
  ],
  [OfframpHandlerType.ASSETHUB_TO_BRLA]: [
    'prepareTransactions',
    'pendulumFundEphemeral',
    'executeAssetHubToPendulumXCM',
    'subsidizePreSwap',
    'nablaApprove',
    'nablaSwap',
    'subsidizePostSwap',
    'executePendulumToMoonbeamXCM',
    'performBrlaPayoutOnMoonbeam',
    'pendulumCleanup',
  ],
};

export const STATE_ADVANCEMENT_HANDLERS: Record<OnrampHandlerType | OfframpHandlerType, string[]> = {
  ...OFFRAMP_STATE_ADVANCEMENT_HANDLERS,
  ...ONRAMP_STATE_ADVANCEMENT_HANDLERS,
};

export function getNextPhase(handlerType: OfframpHandlerType, currentPhase: string): string | undefined {
  const phases = STATE_ADVANCEMENT_HANDLERS[handlerType];
  const currentIndex = phases.indexOf(currentPhase);

  if (currentIndex === -1 || currentIndex === phases.length - 1) return undefined;
  return phases[currentIndex + 1];
}
