import { describe, expect, it } from "bun:test";
import { RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../constants/constants";
import { getFundedInitialSellRampWhere, getPersistedBlockFlowCompatibilityScope } from "./compatibility-scope";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

describe("persisted block-flow compatibility scope", () => {
  it("scopes pending quotes and resumable ramps to the current flow variant", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const initialRampCutoff = new Date(now.getTime() - RAMP_START_EXPIRATION_TIME_SECONDS * 1000);

    expect(getPersistedBlockFlowCompatibilityScope("mykobo", now)).toEqual({
      pendingQuoteWhere: {
        expiresAt: { [Op.gt]: now },
        flowVariant: "mykobo",
        status: "pending"
      },
      resumableRampWhere: {
        flowVariant: "mykobo",
        [Op.or]: [
          { currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut", "initial"] } },
          { createdAt: { [Op.gte]: initialRampCutoff }, currentPhase: "initial" },
          { currentPhase: "initial", "state.aveniaTicketId": { [Op.ne]: null } },
          // Funded SELL ramps the recovery worker may start past the client window.
          {
            createdAt: { [Op.gt]: new Date(now.getTime() - THREE_DAYS_MS), [Op.lt]: now },
            currentPhase: "initial",
            type: RampDirection.SELL,
            [Op.or]: [
              { "state.squidRouterSwapHash": { [Op.ne]: null } },
              { "state.squidRouterNoPermitTransferHash": { [Op.ne]: null } }
            ]
          }
        ]
      }
    });
  });

  it("selects funded SELL ramps only between the minimum age and the three-day recovery window", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");

    expect(getFundedInitialSellRampWhere(now, 16 * 60 * 1000).createdAt).toEqual({
      [Op.gt]: new Date(now.getTime() - THREE_DAYS_MS),
      [Op.lt]: new Date(now.getTime() - 16 * 60 * 1000)
    });
  });
});
