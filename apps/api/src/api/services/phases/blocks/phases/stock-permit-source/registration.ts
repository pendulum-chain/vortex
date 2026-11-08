import httpStatus from "http-status";
import { Op, type Transaction } from "sequelize";
import { isAddress } from "viem";
import sequelize from "../../../../../../config/database";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../../constants/constants";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { validateOfframpQuote } from "../../core/offramp-validation";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { StockPermitSourceMetadata } from "./simulation";

export interface StockPermitSourceRegistrationInput extends Record<string, unknown> {
  walletAddress?: string;
}

export interface StockPermitSourceRegistrationFacts {
  owner: string;
}

/**
 * The stock sale, if any, that this account still has open: every non-terminal one except an unstarted one whose start
 * window has closed. Only the account is matched: registration does not prove control of the wallet, so another
 * account's sale from it neither blocks nor is revealed to this one.
 */
async function findActiveStockSale(userId: string, transaction?: Transaction): Promise<string | null> {
  if (transaction) {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
      replacements: { key: `stocks:sell:user:${userId}` },
      transaction
    });
  }
  const ramp = await RampState.findOne({
    attributes: ["id"],
    ...(transaction ? { transaction } : {}),
    where: {
      [Op.and]: [
        sequelize.literal("state->'blockState'->'stockPermitSource' IS NOT NULL"),
        { userId },
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

/** A sale that fails after funding has spent the funding wallet's gas, so an account gets this many a day. */
const MAX_FUNDED_FAILED_SALES_PER_DAY = 3;

/** This account's sales from the last day that were funded (reached `stockPermitTransfer`) and then failed. */
function countFundedFailedStockSales(userId: string, transaction?: Transaction): Promise<number> {
  return RampState.count({
    ...(transaction ? { transaction } : {}),
    where: {
      [Op.and]: [
        sequelize.literal("state->'blockState'->'stockPermitSource' IS NOT NULL"),
        sequelize.literal(`phase_history @> '[{"phase": "stockPermitTransfer"}]'::jsonb`),
        { userId },
        { currentPhase: "failed" },
        { createdAt: { [Op.gt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    }
  });
}

export async function registerStockPermitSource(
  ctx: RegisterCtx<StockPermitSourceMetadata, StockPermitSourceRegistrationInput>
): Promise<RegistrationResult<StockPermitSourceRegistrationFacts, StockPermitSourceMetadata>> {
  const { walletAddress } = ctx.input;
  if (!walletAddress) {
    throw new APIError({ message: "walletAddress is required for offramping", status: httpStatus.BAD_REQUEST });
  }
  if (!isAddress(walletAddress, { strict: false })) {
    throw new APIError({ message: "walletAddress is not a valid EVM address", status: httpStatus.BAD_REQUEST });
  }
  validateOfframpQuote(ctx.quote as Parameters<typeof validateOfframpQuote>[0], [...ctx.signingAccounts], {
    requireSubstrateEphemeral: false
  });
  const activeRampId = await findActiveStockSale(ctx.authenticatedUser.id, ctx.transaction);
  if (activeRampId) {
    throw new APIError({
      isPublic: true,
      message: `A stock sale is already in progress (${activeRampId}); wait for it to finish before starting another`,
      status: httpStatus.CONFLICT
    });
  }
  if ((await countFundedFailedStockSales(ctx.authenticatedUser.id, ctx.transaction)) >= MAX_FUNDED_FAILED_SALES_PER_DAY) {
    throw new APIError({
      isPublic: true,
      message: "Too many stock sales failed in the last 24 hours; try again later",
      status: httpStatus.TOO_MANY_REQUESTS
    });
  }
  return { facts: { owner: walletAddress } };
}
