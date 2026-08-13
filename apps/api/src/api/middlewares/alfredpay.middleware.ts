import { AlfredPayCountry, AlfredpayCustomerType } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";

export const validateResultCountry = (req: Request, res: Response, next: NextFunction) => {
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
