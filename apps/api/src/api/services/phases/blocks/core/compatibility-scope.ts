import { Op } from "sequelize";
import type { FlowVariant } from "../../../../../config/vars";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../constants/constants";

const TERMINAL_RAMP_PHASES = ["complete", "failed", "timedOut"] as const;

/**
 * Selects only persisted state that this backend could still execute.
 *
 * A registered ramp remains in `initial` until startRamp is called. Both updateRamp
 * and the public startRamp reject it after the shared expiration window. Avenia ramps
 * are the exception: registration creates a payable PIX ticket, and the recovery
 * worker may start an expired initial ramp after the provider confirms payment. Those
 * rows therefore remain deployment dependencies. Once a ramp has entered a financial
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
        { currentPhase: "initial", "state.aveniaTicketId": { [Op.ne]: null } }
      ]
    }
  };
}
