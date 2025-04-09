import phaseRegistry from './phase-registry';
import initialPhaseHandler from './handlers/initial-phase-handler';
import squidRouterPhaseHandler from './handlers/squid-router-phase-handler';
import logger from '../../../config/logger';
import pendulumToMoonbeamXCMPhaseHandler from './handlers/pendulum-moonbeam-phase-handler';
import nablaSwapHandler from './handlers/nabla-swap-handler';
import nablaApproveHandler from './handlers/nabla-approve-handler';
import stellarPaymentHandler from './handlers/stellar-payment-handler';
import stellarCleanupHandler from './handlers/stellar-cleanup-handler';
import spacewalkRedeemHandler from './handlers/spacewalk-redeem-handler';
import pendulumCleanupPhaseHandler from './handlers/pendulum-cleanup-handler';
import subsidizePostSwapPhaseHandler from './handlers/subsidize-post-swap-handler';
import subsidizePreSwapPhaseHandler from './handlers/subsidize-pre-swap-handler';
import moonbeamToPendulumPhaseHandler from './handlers/moonbeam-to-pendulum-handler';
import brlaPayoutMoonbeamHandler from './handlers/brla-payout-moonbeam-handler';
import moonbeamToPendulumXcmHandler from './handlers/moonbeam-to-pendulum-xcm-handler';
import fundEphemeralHandler from './handlers/fund-ephemeral-handler';
import createPayInHandler from './handlers/create-pay-in-handler';
import moonbeamCleanupHandler from './handlers/moonbeam-cleanup-handler';
import completePhaseHandler from './handlers/complete-phase-handler';
/**
 * Register all phase handlers
 */
export function registerPhaseHandlers(): void {
  logger.info('Registering phase handlers');

  // Register handlers
  phaseRegistry.registerHandler(initialPhaseHandler);
  phaseRegistry.registerHandler(completePhaseHandler);
  phaseRegistry.registerHandler(squidRouterPhaseHandler);
  phaseRegistry.registerHandler(pendulumToMoonbeamXCMPhaseHandler);
  phaseRegistry.registerHandler(nablaApproveHandler);
  phaseRegistry.registerHandler(nablaSwapHandler);
  phaseRegistry.registerHandler(stellarPaymentHandler);
  phaseRegistry.registerHandler(stellarCleanupHandler);
  phaseRegistry.registerHandler(spacewalkRedeemHandler);
  phaseRegistry.registerHandler(pendulumCleanupPhaseHandler);
  phaseRegistry.registerHandler(subsidizePostSwapPhaseHandler);
  phaseRegistry.registerHandler(subsidizePreSwapPhaseHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumPhaseHandler);
  phaseRegistry.registerHandler(brlaPayoutMoonbeamHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumXcmHandler);
  phaseRegistry.registerHandler(fundEphemeralHandler);
  phaseRegistry.registerHandler(createPayInHandler);
  phaseRegistry.registerHandler(moonbeamCleanupHandler);

  logger.info('Phase handlers registered');
}

export default registerPhaseHandlers;
