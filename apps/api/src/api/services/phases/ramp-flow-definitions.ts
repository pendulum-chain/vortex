import { RampPhase } from "@vortexfi/shared";

// ─── BRL On-Ramp (Avenia/BRLA on Base) ───────────────────────────────────────

/** BRL → BRLA direct on Base. No Nabla swap, no Squid. */
export const BRL_ONRAMP_BASE_DIRECT: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "destinationTransfer",
  "complete"
];

/** BRL → USDC same-chain on Base. Nabla swap but no SquidRouter bridge. */
export const BRL_ONRAMP_BASE_SAME_CHAIN: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "destinationTransfer",
  "complete"
];

/** BRL → USDC cross-chain (EVM destination). Full Nabla + SquidRouter bridge. */
export const BRL_ONRAMP_BASE_CROSS_CHAIN: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

// ─── EUR On-Ramp (Mykobo SEPA on Base) ───────────────────────────────────────

/** EUR → EURC direct on Base. No Nabla swap, no Squid. */
export const EUR_ONRAMP_BASE_DIRECT: RampPhase[] = [
  "initial",
  "mykoboOnrampDeposit",
  "fundEphemeral",
  "destinationTransfer",
  "complete"
];

/** EUR → USDC same-chain on Base. Nabla swap but no SquidRouter bridge. */
export const EUR_ONRAMP_BASE_SAME_CHAIN: RampPhase[] = [
  "initial",
  "mykoboOnrampDeposit",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "destinationTransfer",
  "complete"
];

/** EUR → USDC cross-chain (EVM destination). Full Nabla + SquidRouter bridge. */
export const EUR_ONRAMP_BASE_CROSS_CHAIN: RampPhase[] = [
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
  "destinationTransfer",
  "complete"
];

// ─── Alfredpay On-Ramp (USD/MXN/COP via Polygon) ─────────────────────────────

/** Alfredpay same-token direct on Polygon. No SquidRouter swap needed. */
export const ALFREDPAY_ONRAMP_DIRECT: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

/** Alfredpay cross-chain (EVM destination). SquidRouter bridge required. */
export const ALFREDPAY_ONRAMP_CROSS_CHAIN: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

// ─── BRL Off-Ramp (Avenia/BRLA on Base) ──────────────────────────────────────

/** All BRL offramps. USDC → BRLA via Nabla on Base → PIX payout. */
export const BRL_OFFRAMP_BASE: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase",
  "complete"
];

// ─── EUR Off-Ramp (Mykobo on Base) ───────────────────────────────────────────

/** All EUR offramps. USDC → EURC via Nabla on Base → SEPA payout. */
export const EUR_OFFRAMP_BASE: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "mykoboPayoutOnBase",
  "complete"
];

// ─── Alfredpay Off-Ramp (USD/MXN/COP via Polygon) ────────────────────────────

/**
 * All Alfredpay offramps. Permit/transfer on source chain → fund ephemeral →
 * subsidy → fiat payout. Direct and cross-chain share the same phase sequence;
 * the handler differentiates via isDirectTransfer / isNoPermitFallback.
 */
export const ALFREDPAY_OFFRAMP: RampPhase[] = [
  "initial",
  "squidRouterPermitExecute",
  "fundEphemeral",
  "finalSettlementSubsidy",
  "alfredpayOfframpTransfer",
  "complete"
];

// ─── Morpho Vault Deposit On-Ramp (Mykobo SEPA on Base → Morpho Vault) ─────

/** EUR → USDC on Base via Nabla, then deposit into Morpho vault. No SquidRouter bridge. */
export const EUR_ONRAMP_BASE_MORPHO: RampPhase[] = [
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
];

// ─── Morpho Vault Redeem Off-Ramp (Morpho Vault on Ethereum → Mykobo SEPA on Base) ────

/**
 * EUR offramp from Morpho vault shares on Ethereum → SEPA payout via Mykobo.
 * User signs a single EIP-2612 permit; ephemeral broadcasts permit+transferFrom,
 * redeems shares to USDC on Ethereum, bridges USDC to Base, then the existing
 * Mykobo payout leg (Nabla USDC→EURC + EURC→Mykobo) executes on Base.
 */
export const EUR_OFFRAMP_MORPHO: RampPhase[] = [
  "initial",
  "morphoPermitExecute",
  "morphoRedeem",
  "squidRouterApprove",
  "squidRouterSwap",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "mykoboPayoutOnBase",
  "complete"
];
