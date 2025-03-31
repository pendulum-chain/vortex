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
import subsidizePreSwapPhaseHandler  from './handlers/subsidize-pre-swap-handler';

/**
 * Register all phase handlers
 */
export function registerPhaseHandlers(): void {
  logger.info('Registering phase handlers');

  // Register handlers
  phaseRegistry.registerHandler(initialPhaseHandler);
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

  // Add more handlers here as they are implemented
  // Example:
  // phaseRegistry.registerHandler(pendulumFundEphemeralPhaseHandler);
  // etc.

  logger.info('Phase handlers registered');
}

export default registerPhaseHandlers;
