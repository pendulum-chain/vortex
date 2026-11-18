import httpStatus from "http-status";
import { Op, type Transaction } from "sequelize";
import { isAddress } from "viem";
import sequelize from "../../../../../../config/database";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../../../../../constants/constants";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { isBaseUsdcGoldRoute } from "../../core/gold-base";
import { validateOfframpQuote } from "../../core/offramp-validation";
import { isBaseUsdcRobinhoodRoute } from "../../core/robinhood-stocks";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import {
  GoldPermitSourceContext,
  type PermitSourceContext,
  StockPermitSourceContext,
  type StockPermitSourceMetadata
} from "./simulation";

export interface StockPermitSourceRegistrationInput extends Record<string, unknown> {
  walletAddress?: string;
  destinationAddress?: string;
}

export interface StockPermitSourceRegistrationFacts {
  owner: string;
}

/** Gold and Stocks each allow one open order per account, counted and locked on their own. */
const lockScope = (context: PermitSourceContext) =>
  context.key === GoldPermitSourceContext.key ? "gold:order:user" : "stocks:sell:user";
// The key is one of two code constants, never request data.
const hasBlockState = (context: PermitSourceContext) => sequelize.literal(`state->'blockState'->'${context.key}' IS NOT NULL`);

/**
 * The stock sale, if any, that this account still has open: every non-terminal one except an unstarted one whose start
 * window has closed. Only the account is matched: registration does not prove control of the wallet, so another
 * account's sale from it neither blocks nor is revealed to this one.
 */
async function findActiveStockSale(
  userId: string,
  context: PermitSourceContext,
  transaction?: Transaction
): Promise<string | null> {
  if (transaction) {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
      replacements: { key: `${lockScope(context)}:${userId}` },
      transaction
    });
  }
  const ramp = await RampState.findOne({
    attributes: ["id"],
    ...(transaction ? { transaction } : {}),
    where: {
      [Op.and]: [
        hasBlockState(context),
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

/** A started sale that fails may have spent the funding wallet's gas, so an account gets this many a day. */
const MAX_STARTED_FAILED_SALES_PER_DAY = 3;

/**
 * This account's sales registered in the last day that were started (left `initial`) and then failed. Funding is sent
 * in `fundEphemeral`, and a sale can still fail there after it was sent, so every started sale counts.
 */
function countStartedFailedStockSales(
  userId: string,
  context: PermitSourceContext,
  transaction?: Transaction
): Promise<number> {
  return RampState.count({
    ...(transaction ? { transaction } : {}),
    where: {
      [Op.and]: [
        hasBlockState(context),
        sequelize.literal(`jsonb_path_exists(phase_history, '$[*] ? (@.phase != "initial")')`),
        { userId },
        { currentPhase: "failed" },
        { createdAt: { [Op.gt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    }
  });
}

export async function registerStockPermitSource(
  ctx: RegisterCtx<StockPermitSourceMetadata, StockPermitSourceRegistrationInput>,
  context: PermitSourceContext = StockPermitSourceContext
): Promise<RegistrationResult<StockPermitSourceRegistrationFacts, StockPermitSourceMetadata>> {
  const gold = context.key === GoldPermitSourceContext.key;
  const { walletAddress } = ctx.input;
  if (!walletAddress) {
    throw new APIError({ message: "walletAddress is required for offramping", status: httpStatus.BAD_REQUEST });
  }
  if (!isAddress(walletAddress, { strict: false })) {
    throw new APIError({ message: "walletAddress is not a valid EVM address", status: httpStatus.BAD_REQUEST });
  }
  if (isBaseUsdcRobinhoodRoute(ctx.quote) || isBaseUsdcGoldRoute(ctx.quote)) {
    if (walletAddress.toLowerCase() !== ctx.input.destinationAddress?.toLowerCase()) {
      throw new APIError({
        message: `${gold ? "Gold" : "Stock"} USDC funding and delivery must use the same wallet`,
        status: 400
      });
    }
  } else {
    validateOfframpQuote(ctx.quote as Parameters<typeof validateOfframpQuote>[0], [...ctx.signingAccounts], {
      requireSubstrateEphemeral: false
    });
  }
  const activeRampId = await findActiveStockSale(ctx.authenticatedUser.id, context, ctx.transaction);
  if (activeRampId) {
    throw new APIError({
      isPublic: true,
      message: `A ${gold ? "gold order" : "stock sale"} is already in progress (${activeRampId}); wait for it to finish before starting another`,
      status: httpStatus.CONFLICT
    });
  }
  if (
    (await countStartedFailedStockSales(ctx.authenticatedUser.id, context, ctx.transaction)) >= MAX_STARTED_FAILED_SALES_PER_DAY
  ) {
    throw new APIError({
      isPublic: true,
      // Each message stays a whole literal: the consumer apps map it verbatim, and their tests look for it in this source.
      message: gold
        ? "Too many gold orders failed in the last 24 hours; try again later"
        : "Too many stock sales failed in the last 24 hours; try again later",
      status: httpStatus.TOO_MANY_REQUESTS
    });
  }
  return { facts: { owner: walletAddress } };
}
