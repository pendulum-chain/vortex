import phaseRegistry from './phase-registry';
import initialPhaseHandler from './handlers/initial-phase-handler';
import prepareTransactionsPhaseHandler from './handlers/prepare-transactions-phase-handler';
import squidRouterPhaseHandler from './handlers/squid-router-phase-handler';
import logger from '../../../config/logger';

/**
 * Register all phase handlers
 */
export function registerPhaseHandlers(): void {
  logger.info('Registering phase handlers');

  // Register handlers
  phaseRegistry.registerHandler(initialPhaseHandler);
  phaseRegistry.registerHandler(prepareTransactionsPhaseHandler);
  phaseRegistry.registerHandler(squidRouterPhaseHandler);

  // Add more handlers here as they are implemented
  // Example:
  // phaseRegistry.registerHandler(pendulumFundEphemeralPhaseHandler);
  // etc.

  logger.info('Phase handlers registered');
}

export default registerPhaseHandlers;
