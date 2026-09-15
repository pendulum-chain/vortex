import { Op, type Transaction } from "sequelize";
import sequelize from "../../../config/database";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../constants/constants";
import RampState from "../../../models/rampState.model";

/**
 * The Monerium ramp, if any, that can still mint to and pull from `owner`: every non-terminal
 * ramp except an unstarted one whose start window has already closed. Two such ramps would share
 * the owner's ERC-2612 nonce and race for the same SEPA credit, and an IBAN move under one would
 * redirect the mint it is waiting for.
 */
export async function findActiveMoneriumRampForOwner(owner: string, transaction?: Transaction): Promise<string | null> {
  const ramp = await RampState.findOne({
    attributes: ["id"],
    ...(transaction ? { transaction } : {}),
    where: {
      [Op.and]: [
        sequelize.where(
          sequelize.fn("lower", sequelize.literal("state->'blockState'->'moneriumIssue'->>'owner'")),
          owner.toLowerCase()
        ),
        { currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut"] } },
        {
          [Op.or]: [
            { currentPhase: { [Op.ne]: "initial" } },
            { createdAt: { [Op.gt]: new Date(Date.now() - RAMP_START_EXPIRATION_TIME_SECONDS * 1000) } }
          ]
        }
      ]
    }
  });
  return ramp?.id ?? null;
}
