import { RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import type { FlowVariant } from "../../../../../config/vars";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../constants/constants";

const TERMINAL_RAMP_PHASES = ["complete", "failed", "timedOut"] as const;
const FUNDED_SELL_RECOVERY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * `initial` SELL ramps whose user-broadcast source transaction hash was already reported, created
 * within the recovery window and at least `minAgeMs` ago. The user's funds are on the ephemeral
 * once that transaction mines, so the recovery worker starts these past the client start window.
 * The worker selects with this predicate and the startup check keeps their flow versions
 * registered, so the two cannot drift apart.
 */
export function getFundedInitialSellRampWhere(now = new Date(), minAgeMs = 0) {
  return {
    createdAt: {
      [Op.gt]: new Date(now.getTime() - FUNDED_SELL_RECOVERY_WINDOW_MS),
      [Op.lt]: new Date(now.getTime() - minAgeMs)
    },
    currentPhase: "initial" as const,
    type: RampDirection.SELL,
    [Op.or]: [
      { "state.squidRouterSwapHash": { [Op.ne]: null } },
      { "state.squidRouterNoPermitTransferHash": { [Op.ne]: null } }
    ]
  };
}

/**
 * Selects only persisted state that this backend could still execute.
 *
 * A registered ramp remains in `initial` until startRamp is called. Both updateRamp
 * and the public startRamp reject it after the shared expiration window. Two kinds of
 * ramp are the exception: Avenia registration creates a payable PIX ticket, and the
 * recovery worker may start an expired initial ramp after the provider confirms payment;
 * and a SELL ramp whose user already reported its source transaction hash is started by
 * the same worker (see getFundedInitialSellRampWhere). Those rows therefore remain
 * deployment dependencies. Once a ramp has entered a financial
 * phase, age never makes it safe to ignore: every non-terminal phase owned by this flow
 * variant stays fail-closed.
 */
export function getPersistedBlockFlowCompatibilityScope(flowVariant: FlowVariant, now = new Date()) {
  const initialRampCutoff = new Date(now.getTime() - RAMP_START_EXPIRATION_TIME_SECONDS * 1000);

  return {
    pendingQuoteWhere: {
      expiresAt: { [Op.gt]: now },
      flowVariant,
      status: "pending" as const
    },
    resumableRampWhere: {
      flowVariant,
      [Op.or]: [
        { currentPhase: { [Op.notIn]: [...TERMINAL_RAMP_PHASES, "initial"] } },
        { createdAt: { [Op.gte]: initialRampCutoff }, currentPhase: "initial" },
        { currentPhase: "initial", "state.aveniaTicketId": { [Op.ne]: null } },
        getFundedInitialSellRampWhere(now)
      ]
    }
  };
}
