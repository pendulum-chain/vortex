import logger from "../../../config/logger";
import alfredpayOfframpTransferHandler from "./handlers/alfredpay-offramp-transfer-handler";
import alfredpayOnrampMintHandler from "./handlers/alfredpay-onramp-mint-handler";
import brlaOnrampMintHandler from "./handlers/brla-onramp-mint-handler";
import brlaPayoutBaseHandler from "./handlers/brla-payout-base-handler";
import destinationTransferHandler from "./handlers/destination-transfer-handler";
import distributeFeesHandler from "./handlers/distribute-fees-handler";
import finalSettlementSubsidy from "./handlers/final-settlement-subsidy";
import fundEphemeralHandler from "./handlers/fund-ephemeral-handler";
import hydrationSwapHandler from "./handlers/hydration-swap-handler";
import hydrationToAssethubXcmPhaseHandler from "./handlers/hydration-to-assethub-xcm-phase-handler";
import initialPhaseHandler from "./handlers/initial-phase-handler";
import moneriumOnrampMintPhaseHandler from "./handlers/monerium-onramp-mint-handler";
import moneriumOnrampSelfTransferHandler from "./handlers/monerium-onramp-self-transfer-handler";
import moonbeamToPendulumPhaseHandler from "./handlers/moonbeam-to-pendulum-handler";
import moonbeamToPendulumXcmHandler from "./handlers/moonbeam-to-pendulum-xcm-handler";
import nablaApproveHandler from "./handlers/nabla-approve-handler";
import nablaSwapHandler from "./handlers/nabla-swap-handler";
import pendulumToAssethubPhaseHandler from "./handlers/pendulum-to-assethub-phase-handler";
import pendulumToHydrationXcmPhaseHandler from "./handlers/pendulum-to-hydration-xcm-phase-handler";
import pendulumToMoonbeamXcmHandler from "./handlers/pendulum-to-moonbeam-xcm-handler";
import spacewalkRedeemHandler from "./handlers/spacewalk-redeem-handler";
import squidRouterPayPhaseHandler from "./handlers/squid-router-pay-phase-handler";
import squidRouterPhaseHandler from "./handlers/squid-router-phase-handler";
import squidRouterPermitExecutionHandler from "./handlers/squidrouter-permit-execution-handler";
import stellarPaymentHandler from "./handlers/stellar-payment-handler";
import subsidizePostSwapEvmPhaseHandler from "./handlers/subsidize-post-swap-evm-handler";
import subsidizePostSwapPhaseHandler from "./handlers/subsidize-post-swap-handler";
import subsidizePreSwapEvmPhaseHandler from "./handlers/subsidize-pre-swap-evm-handler";
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
  phaseRegistry.registerHandler(nablaApproveHandler);
  phaseRegistry.registerHandler(nablaSwapHandler);
  phaseRegistry.registerHandler(stellarPaymentHandler);
  phaseRegistry.registerHandler(spacewalkRedeemHandler);
  phaseRegistry.registerHandler(subsidizePostSwapPhaseHandler);
  phaseRegistry.registerHandler(subsidizePostSwapEvmPhaseHandler);
  phaseRegistry.registerHandler(subsidizePreSwapPhaseHandler);
  phaseRegistry.registerHandler(subsidizePreSwapEvmPhaseHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumPhaseHandler);
  phaseRegistry.registerHandler(brlaPayoutBaseHandler);
  phaseRegistry.registerHandler(fundEphemeralHandler);
  phaseRegistry.registerHandler(alfredpayOnrampMintHandler);
  phaseRegistry.registerHandler(alfredpayOfframpTransferHandler);
  phaseRegistry.registerHandler(brlaOnrampMintHandler);
  phaseRegistry.registerHandler(pendulumToAssethubPhaseHandler);
  phaseRegistry.registerHandler(squidRouterPayPhaseHandler);
  phaseRegistry.registerHandler(distributeFeesHandler);
  phaseRegistry.registerHandler(moneriumOnrampSelfTransferHandler);
  phaseRegistry.registerHandler(moneriumOnrampMintPhaseHandler);
  phaseRegistry.registerHandler(moonbeamToPendulumXcmHandler);
  phaseRegistry.registerHandler(pendulumToMoonbeamXcmHandler);
  phaseRegistry.registerHandler(pendulumToHydrationXcmPhaseHandler);
  phaseRegistry.registerHandler(hydrationToAssethubXcmPhaseHandler);
  phaseRegistry.registerHandler(hydrationSwapHandler);
  phaseRegistry.registerHandler(finalSettlementSubsidy);
  phaseRegistry.registerHandler(destinationTransferHandler);
  phaseRegistry.registerHandler(squidRouterPermitExecutionHandler);

  logger.info("Phase handlers registered");
}

export default registerPhaseHandlers;
