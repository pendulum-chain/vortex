import { Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { describe, expect, it, mock } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { validateCreateBestQuoteInput } from "./validators";

function buildRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response["status"];
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res as Response;
  }) as Response["json"];
  return res as Response & { statusCode?: number; body?: unknown };
}

function runValidator(body: Record<string, unknown>) {
  const req = { body } as unknown as Request;
  const res = buildRes();
  const next: NextFunction = mock(() => undefined) as unknown as NextFunction;
  validateCreateBestQuoteInput(req, res, next);
  return { next, res };
}

const baseBody = {
  inputAmount: "100",
  inputCurrency: "BRL",
  outputCurrency: "USDC",
  rampType: RampDirection.BUY,
  from: "pix"
};

describe("validateCreateBestQuoteInput - networks whitelist", () => {
  it("passes when networks is omitted (preserves existing behavior)", () => {
    const { next, res } = runValidator({ ...baseBody });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("passes when networks is a valid array of Networks values", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [Networks.Base, Networks.Polygon] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("normalizes case-insensitive networks entries to canonical Networks values", () => {
    const body: Record<string, unknown> = { ...baseBody, networks: ["BASE", "Polygon", "BASE-SEPOLIA", "polygonamoy"] };
    const req = { body } as unknown as Request;
    const res = buildRes();
    const next: NextFunction = mock(() => undefined) as unknown as NextFunction;
    validateCreateBestQuoteInput(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
    expect(body.networks).toEqual([Networks.Base, Networks.Polygon, Networks.BaseSepolia, Networks.PolygonAmoy]);
  });

  it("passes when networks is an empty array (treated as omitted)", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("rejects with 400 when networks contains an unknown identifier", () => {
    const { next, res } = runValidator({ ...baseBody, networks: ["base", "not-a-real-chain"] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when networks is not an array", () => {
    const { next, res } = runValidator({ ...baseBody, networks: "base" });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when networks contains a non-string entry", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [Networks.Base, 42] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when required fields are missing even if networks is valid", () => {
    const { next, res } = runValidator({ rampType: RampDirection.BUY, networks: [Networks.Base] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.MissingRequiredFields });
  });
});
