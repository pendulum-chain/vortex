import logger from "../../../config/logger";
import brlaPayoutMoonbeamHandler from "./handlers/brla-payout-moonbeam-handler";
import brlaTeleportHandler from "./handlers/brla-teleport-handler";
import distributeFeesHandler from "./handlers/distribute-fees-handler";
import fundEphemeralHandler from "./handlers/fund-ephemeral-handler";
import initialPhaseHandler from "./handlers/initial-phase-handler";
import moneriumOnrampMintPhaseHandler from "./handlers/monerium-onramp-mint-handler";
import moneriumOnrampSelfTransferHandler from "./handlers/monerium-onramp-self-transfer-handler";
import moonbeamToPendulumPhaseHandler from "./handlers/moonbeam-to-pendulum-handler";
import moonbeamToPendulumXcmHandler from "./handlers/moonbeam-to-pendulum-xcm-handler";
import nablaApproveHandler from "./handlers/nabla-approve-handler";
import nablaSwapHandler from "./handlers/nabla-swap-handler";
import pendulumToMoonbeamXCMPhaseHandler from "./handlers/pendulum-moonbeam-phase-handler";
import pendulumToAssethubPhaseHandler from "./handlers/pendulum-to-assethub-phase-handler";
import spacewalkRedeemHandler from "./handlers/spacewalk-redeem-handler";
import squidRouterPayPhaseHandler from "./handlers/squid-router-pay-phase-handler";
import squidRouterPhaseHandler from "./handlers/squid-router-phase-handler";
import stellarPaymentHandler from "./handlers/stellar-payment-handler";
import subsidizePostSwapPhaseHandler from "./handlers/subsidize-post-swap-handler";
import subsidizePreSwapPhaseHandler from "./handlers/subsidize-pre-swap-handler";
import phaseRegistry from "./phase-registry";
/**
 * Register all phase handlers
 */
export function registerPhaseHandlers(): void {
  logger.info("Registering phase handlers");

  // Register handlers
  phaseRegistry.registerHandler(initialPhaseHandler);
  phaseRegistry.registerHandler(squidRouterPhaseHandler);
  phaseRegistry.registerHandler(pendulumToMoonbeamXCMPhaseHandler);
  phaseRegistry.registerHandler(nablaApproveHandler);
  phaseRegistry.registerHandler(nablaSwapHandler);
  phaseRegistry.registerHandler(stellarPaymentHandler);
  phaseRegistry.registerHandler(spacewalkRedeemHandler);
  phaseRegistry.registerHandler(subsidizePostSwapPhaseHandler);
  phaseRegistry.registerHandler(subsidizePreSwapPhaseHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumPhaseHandler);
  phaseRegistry.registerHandler(brlaPayoutMoonbeamHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumXcmHandler);
  phaseRegistry.registerHandler(fundEphemeralHandler);
  phaseRegistry.registerHandler(brlaTeleportHandler);
  phaseRegistry.registerHandler(pendulumToAssethubPhaseHandler);
  phaseRegistry.registerHandler(squidRouterPayPhaseHandler);
  phaseRegistry.registerHandler(distributeFeesHandler);
  phaseRegistry.registerHandler(moneriumOnrampSelfTransferHandler);
  phaseRegistry.registerHandler(moneriumOnrampMintPhaseHandler);

  logger.info("Phase handlers registered");
}

export default registerPhaseHandlers;
