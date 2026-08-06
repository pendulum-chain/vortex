import { type CorridorCountry, FIAT_TOKEN_CORRIDOR, FiatToken } from "@vortexfi/shared";
import { Request } from "express";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { getTargetFiatCurrency } from "../services/phases/blocks/core/helpers";

const ALFREDPAY_CORRIDORS: CorridorCountry[] = ["AR", "CO", "MX", "US"];

export function getManagedProfileCountryCorridor(req: Request): CorridorCountry | undefined {
  const country = req.query.country ?? req.body?.country;
  return typeof country === "string" && ALFREDPAY_CORRIDORS.includes(country as CorridorCountry)
    ? (country as CorridorCountry)
    : undefined;
}

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
