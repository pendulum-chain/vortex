import { describe, expect, it, mock } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { validateAlfredpayCustomerType } from "./alfredpay.middleware";

function run(type: unknown) {
  const next = mock(() => undefined);
  const json = mock(() => undefined);
  const status = mock(() => ({ json }));

  validateAlfredpayCustomerType({ query: type === undefined ? {} : { type } } as unknown as Request, { status } as unknown as Response, next as NextFunction);

  return { json, next, status };
}

describe("validateAlfredpayCustomerType", () => {
  it("accepts an omitted or supported customer type", () => {
    expect(run(undefined).next).toHaveBeenCalledTimes(1);
    expect(run("INDIVIDUAL").next).toHaveBeenCalledTimes(1);
    expect(run("BUSINESS").next).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown and repeated customer types", () => {
    for (const type of ["BUSINES", "business", ["BUSINESS", "INDIVIDUAL"]]) {
      const { json, next, status } = run(type);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: "Invalid type: expected INDIVIDUAL or BUSINESS" });
    }
  });
});
