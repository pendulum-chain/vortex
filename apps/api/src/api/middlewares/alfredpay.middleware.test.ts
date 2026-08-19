import { describe, expect, it, mock } from "bun:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { AddressInfo } from "node:net";
import {
  setAlfredpayCountryFromRoute,
  validateAlfredpayCustomerType,
  validateResultCountry
} from "./alfredpay.middleware";

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

describe("setAlfredpayCountryFromRoute", () => {
  it("uses the country route when the request omits or conflicts with it", async () => {
    const app = express();
    app.use(express.json());
    app.use(["/mx", "/co", "/ar"], setAlfredpayCountryFromRoute, validateResultCountry, (req, res) => {
      res.json({ bodyCountry: req.body.country, queryCountry: req.query.country });
    });
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));

    try {
      const { port } = server.address() as AddressInfo;

      for (const country of ["mx", "co", "ar"]) {
        const response = await fetch(`http://127.0.0.1:${port}/${country}/status?country=US`, {
          body: JSON.stringify({ country: "DO" }),
          headers: { "content-type": "application/json" },
          method: "POST"
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ bodyCountry: country.toUpperCase(), queryCountry: country.toUpperCase() });
      }

      const response = await fetch(`http://127.0.0.1:${port}/mx/status`, {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ bodyCountry: "MX", queryCountry: "MX" });
    } finally {
      server.close();
    }
  });

  it("overrides a conflicting multipart country after the body is parsed", async () => {
    const app = express();
    app.use("/co", setAlfredpayCountryFromRoute, multer().none(), validateResultCountry, (req, res) => {
      res.json({ bodyCountry: req.body.country, queryCountry: req.query.country });
    });
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const form = new FormData();
      form.set("country", "MX");

      const response = await fetch(`http://127.0.0.1:${port}/co/upload?country=AR`, { body: form, method: "POST" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ bodyCountry: "CO", queryCountry: "CO" });
    } finally {
      server.close();
    }
  });
});
