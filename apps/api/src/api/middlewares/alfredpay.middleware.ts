import { AlfredPayCountry } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";

export const validateResultCountry = (req: Request, res: Response, next: NextFunction) => {
  const country = (req.query.country || req.body.country) as string;

  if (!country) {
    return res.status(400).json({ error: "Country is required" });
  }

  if (!Object.values(AlfredPayCountry).includes(country as AlfredPayCountry)) {
    return res.status(400).json({ error: `Invalid country: ${country}` });
  }

  next();
};
