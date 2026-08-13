import { describe, expect, it } from "bun:test";
import { Op } from "sequelize";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../constants/constants";
import { getPersistedBlockFlowCompatibilityScope } from "./compatibility-scope";

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
          { currentPhase: "initial", "state.aveniaTicketId": { [Op.ne]: null } }
        ]
      }
    });
  });
});
