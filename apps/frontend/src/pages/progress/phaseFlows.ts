import { RampPhase } from "@vortexfi/shared";

export const PHASE_DURATIONS: Record<RampPhase, number> = {
  alfredOnrampMintFallback: 0,
  alfredpayOfframpTransfer: 30,
  alfredpayOfframpTransferFallback: 30,
  alfredpayOnrampMint: 5 * 60,
  assethubToPendulum: 24,
  backupApprove: 0,
  backupSquidRouterApprove: 0,
  backupSquidRouterSwap: 0,
  baseTransfer: 10,
  brlaOnrampMint: 5 * 60,
  brlaPayoutOnBase: 30,
  complete: 0,
  destinationTransfer: 12,
  distributeFees: 24,
  failed: 0,
  finalSettlementSubsidy: 30,
  fundEphemeral: 20,
  hydrationSwap: 30,
  hydrationToAssethubXcm: 30,
  initial: 0,
  moonbeamToPendulum: 40,
  moonbeamToPendulumXcm: 30,
  morphoApprove: 0,
  morphoDeposit: 30,
  mykoboOnrampDeposit: 5 * 60,
  mykoboPayoutOnBase: 60,
  nablaApprove: 24,
  nablaSwap: 24,
  pendulumToAssethubXcm: 30,
  pendulumToHydrationXcm: 30,
  pendulumToMoonbeamXcm: 40,
  squidRouterApprove: 10,
  squidRouterNoPermitApprove: 10,
  squidRouterNoPermitSwap: 60,
  squidRouterNoPermitTransfer: 30,
  squidRouterPay: 60,
  squidRouterPermitExecute: 30,
  squidRouterSwap: 10,
  subsidizePostSwap: 24,
  subsidizePreSwap: 24,
  timedOut: 0
};

export const PHASE_FLOWS = {
  offramp_brl: [
    "initial",
    "fundEphemeral",
    "distributeFees",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "brlaPayoutOnBase",
    "complete"
  ] as RampPhase[],

  offramp_eur_evm: [
    "initial",
    "fundEphemeral",
    "distributeFees",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "mykoboPayoutOnBase",
    "complete"
  ] as RampPhase[],

  onramp_brl: [
    "initial",
    "brlaOnrampMint",
    "fundEphemeral",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "distributeFees",
    "subsidizePostSwap",
    // Base USDC destinations skip directly from squidRouterSwap to destinationTransfer.
    "squidRouterSwap",
    "squidRouterPay",
    "finalSettlementSubsidy",
    "destinationTransfer",
    "complete"
  ] as RampPhase[],

  onramp_eur_evm: [
    "initial",
    "mykoboOnrampDeposit",
    "fundEphemeral",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "squidRouterApprove",
    "squidRouterSwap",
    "squidRouterPay",
    "distributeFees",
    "destinationTransfer",
    "complete"
  ] as RampPhase[],

  onramp_eur_morpho: [
    "initial",
    "mykoboOnrampDeposit",
    "fundEphemeral",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "distributeFees",
    "subsidizePostSwap",
    "squidRouterSwap",
    "squidRouterPay",
    "finalSettlementSubsidy",
    "morphoDeposit",
    "complete"
  ] as RampPhase[]
};
