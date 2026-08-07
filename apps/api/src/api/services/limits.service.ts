import {
  type AccountLimitsResponse,
  ALFREDPAY_EVM_TOKEN,
  BrlaApiError,
  BrlaApiService,
  BrlaCurrency,
  FiatToken,
  GetUserLimitsResponse,
  LimitsCorridor,
  RampDirection,
  UserLimit,
  UserLimitPeriod
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import {
  getCurrentUtcMonthPeriod,
  getReportedAlfredpayMonthlyUsage,
  resolveAlfredpayQuoteLimits
} from "./alfredpay/alfredpay.helpers";
import { resolveAveniaAccountForUser } from "./avenia-account";

const CORRIDOR_FIAT: Record<Exclude<LimitsCorridor, "BR">, FiatToken> = {
  AR: FiatToken.ARS,
  CO: FiatToken.COP,
  MX: FiatToken.MXN,
  US: FiatToken.USD
};

function calendarMonthPeriod(year: number, month: number): UserLimitPeriod {
  return {
    endsAt: new Date(Date.UTC(year, month, 1)).toISOString(),
    startsAt: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    type: "calendar_month"
  };
}

async function getAlfredpayLimits(userId: string, corridor: Exclude<LimitsCorridor, "BR">): Promise<UserLimit[]> {
  const fiat = CORRIDOR_FIAT[corridor];
  const now = new Date();
  const { startsAt } = getCurrentUtcMonthPeriod(now);
  const period = calendarMonthPeriod(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1);

  const limits: UserLimit[] = [];
  for (const direction of [RampDirection.BUY, RampDirection.SELL]) {
    const resolved = await resolveAlfredpayQuoteLimits({
      inputCurrency: direction === RampDirection.BUY ? fiat : ALFREDPAY_EVM_TOKEN,
      outputCurrency: direction === RampDirection.BUY ? ALFREDPAY_EVM_TOKEN : fiat,
      rampType: direction,
      userId
    });
    if (!resolved) {
      throw new APIError({ message: `Limits unavailable for ${corridor}`, status: httpStatus.BAD_REQUEST });
    }

    const used = await getReportedAlfredpayMonthlyUsage(userId, direction, fiat, resolved.stablecoin);
    limits.push({
      corridor,
      currency: direction === RampDirection.BUY ? fiat : ALFREDPAY_EVM_TOKEN,
      direction,
      max: resolved.max,
      period,
      used: used.toFixed()
    });
  }
  return limits;
}

async function getAveniaLimits(userId: string): Promise<UserLimit[]> {
  const account = await resolveAveniaAccountForUser(userId);
  let response: AccountLimitsResponse | undefined;
  try {
    response = await BrlaApiService.getInstance().getSubaccountUsedLimit(account.subAccountId);
  } catch (error) {
    if (error instanceof BrlaApiError) {
      throw new APIError({ message: "Avenia limits are unavailable", status: httpStatus.BAD_GATEWAY });
    }
    throw error;
  }
  const brl = response?.limitInfo?.limits.find(limit => limit.currency === BrlaCurrency.BRL);
  if (!brl) {
    throw new APIError({ message: "BRL limits not found", status: httpStatus.BAD_GATEWAY });
  }

  const { year, month } = brl.usedLimit;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new APIError({ message: "Avenia returned invalid limit period", status: httpStatus.BAD_GATEWAY });
  }
  const period = calendarMonthPeriod(year, month);

  return [
    {
      corridor: "BR",
      currency: FiatToken.BRL,
      direction: RampDirection.BUY,
      max: brl.maxFiatIn,
      period,
      used: brl.usedLimit.usedFiatIn
    },
    {
      corridor: "BR",
      currency: FiatToken.BRL,
      direction: RampDirection.SELL,
      max: brl.maxFiatOut,
      period,
      used: brl.usedLimit.usedFiatOut
    }
  ];
}

export async function getUserLimits(userId: string, corridors: LimitsCorridor[]): Promise<GetUserLimitsResponse> {
  const limitsByCorridor = await Promise.all(
    corridors.map(corridor => (corridor === "BR" ? getAveniaLimits(userId) : getAlfredpayLimits(userId, corridor)))
  );
  return { limits: limitsByCorridor.flat() };
}
