import { AlfredPayCountry, AlfredpayCustomerType } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";

export const setAlfredpayCountryFromRoute = (req: Request, res: Response, next: NextFunction) => {
  const country = req.baseUrl.slice(req.baseUrl.lastIndexOf("/") + 1).toUpperCase();
  const queryStart = req.url.indexOf("?");
  const pathname = queryStart === -1 ? req.url : req.url.slice(0, queryStart);
  const searchParams = new URLSearchParams(queryStart === -1 ? "" : req.url.slice(queryStart + 1));

  // Express 5 exposes req.query as a getter, so make the route country canonical through the URL.
  searchParams.set("country", country);
  req.url = `${pathname}?${searchParams.toString()}`;
  res.locals.alfredpayCountry = country;
  next();
};

export const validateResultCountry = (req: Request, res: Response, next: NextFunction) => {
  const routeCountry = res.locals.alfredpayCountry as string | undefined;

  if (routeCountry) {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      req.body = {};
    }
    (req.body as Record<string, unknown>).country = routeCountry;
  }

  const queryCountry = req.query.country as string | undefined;
  const bodyCountry = req.body?.country as string | undefined;

  // Handlers read the country from one source only, so an ambiguous pair must never reach them:
  // authorization would otherwise be granted for one country and the operation run against another.
  if (queryCountry !== undefined && bodyCountry !== undefined && queryCountry !== bodyCountry) {
    return res.status(400).json({ error: "Conflicting country in query and body" });
  }

  const country = (queryCountry || bodyCountry) as string;

  if (!country) {
    return res.status(400).json({ error: "Country is required" });
  }

  if (!Object.values(AlfredPayCountry).includes(country as AlfredPayCountry)) {
    return res.status(400).json({ error: `Invalid country: ${country}` });
  }

  next();
};

export const validateAlfredpayCustomerType = (req: Request, res: Response, next: NextFunction) => {
  const type = req.query.type;

  if (type === undefined) {
    next();
    return;
  }

  if (typeof type !== "string" || !Object.values(AlfredpayCustomerType).includes(type as AlfredpayCustomerType)) {
    return res.status(400).json({ error: "Invalid type: expected INDIVIDUAL or BUSINESS" });
  }

  next();
};
