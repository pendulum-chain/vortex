import {
  type CorridorCountry,
  DomesticCustomerType,
  FIAT_TOKEN_CORRIDOR,
  FiatToken,
  type LimitsCorridor
} from "@vortexfi/shared";
import { Request } from "express";
import type { CustomerEntityType } from "../../models/customerEntity.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { getTargetFiatCurrency } from "../services/phases/blocks/core/helpers";

const ALFREDPAY_CORRIDORS: CorridorCountry[] = ["AR", "CO", "MX", "US"];

// Handlers read a parameter from exactly one source: query on GET, body on POST. Authorizing a
// value the handler will not use would let a caller present an allowed corridor in the query while
// the handler operates on a different one in the body, so a divergent pair fails the check closed
// instead of resolving to either value.
function hasConflictingParameter(req: Request, key: string): boolean {
  const queryValue = req.query[key];
  const bodyValue = req.body?.[key];
  return queryValue !== undefined && bodyValue !== undefined && queryValue !== bodyValue;
}

export function getManagedProfileCountryCorridor(req: Request): CorridorCountry | undefined {
  if (hasConflictingParameter(req, "country")) return undefined;
  const country = req.query.country ?? req.body?.country;
  return typeof country === "string" && ALFREDPAY_CORRIDORS.includes(country as CorridorCountry)
    ? (country as CorridorCountry)
    : undefined;
}

export function getManagedProfileAlfredpayCustomerType(req: Request): CustomerEntityType | undefined {
  if (hasConflictingParameter(req, "type")) return undefined;
  const customerType = req.query.type ?? req.body?.type ?? DomesticCustomerType.INDIVIDUAL;
  if (customerType === DomesticCustomerType.INDIVIDUAL) return "individual";
  if (customerType === DomesticCustomerType.BUSINESS) return "business";
  return undefined;
}

export function getManagedProfileLimitsCorridors(req: Request): CorridorCountry[] | undefined {
  const corridors = req.body?.corridors;
  if (!Array.isArray(corridors) || corridors.length === 0) {
    return undefined;
  }
  if (corridors.some(corridor => typeof corridor !== "string" || !LIMITS_CORRIDORS.includes(corridor as LimitsCorridor))) {
    return undefined;
  }
  return corridors as CorridorCountry[];
}

const LIMITS_CORRIDORS: LimitsCorridor[] = ["AR", "BR", "CO", "MX", "US"];

export async function getManagedProfileQuoteCorridor(req: Request): Promise<CorridorCountry | undefined> {
  const quoteId = req.body?.quoteId;
  if (typeof quoteId !== "string") {
    return undefined;
  }
  const quote = await QuoteTicket.findByPk(quoteId, {
    attributes: ["inputCurrency", "outputCurrency", "rampType"]
  });
  return quote ? getQuoteCorridor(quote) : undefined;
}

export async function getManagedProfileRampCorridor(req: Request): Promise<CorridorCountry | undefined> {
  const rampId = req.body?.rampId;
  if (typeof rampId !== "string") {
    return undefined;
  }
  const ramp = await RampState.findByPk(rampId, { attributes: ["quoteId"] });
  if (!ramp) {
    return undefined;
  }
  const quote = await QuoteTicket.findByPk(ramp.quoteId, {
    attributes: ["inputCurrency", "outputCurrency", "rampType"]
  });
  return quote ? getQuoteCorridor(quote) : undefined;
}

function getQuoteCorridor(
  quote: Pick<QuoteTicket, "inputCurrency" | "outputCurrency" | "rampType">
): CorridorCountry | undefined {
  const fiatToken = getTargetFiatCurrency(quote.rampType, quote.inputCurrency, quote.outputCurrency);
  return FIAT_TOKEN_CORRIDOR[fiatToken as FiatToken];
}
