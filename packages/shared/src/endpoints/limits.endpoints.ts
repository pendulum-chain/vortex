import type { CorridorCountry } from "../corridors";
import type { RampCurrency } from "../tokens/types/base";
import type { RampDirection } from "../types/rampDirection";

export type LimitsCorridor = Exclude<CorridorCountry, "EU">;

export interface GetUserLimitsRequest {
  corridors: LimitsCorridor[];
}

export interface UserLimitPeriod {
  type: "calendar_month";
  startsAt: string;
  endsAt: string;
}

export interface UserLimit {
  corridor: LimitsCorridor;
  direction: RampDirection;
  currency: RampCurrency;
  max: string;
  used: string;
  period: UserLimitPeriod;
}

export interface GetUserLimitsResponse {
  limits: UserLimit[];
}
