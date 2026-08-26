import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { getSupportedCryptocurrencies } from "./cryptocurrencies.config";

describe("getSupportedCryptocurrencies", () => {
  it("does not expose dormant EURe deployments", () => {
    expect(getSupportedCryptocurrencies(Networks.Base).some(token => token.assetSymbol === "EURe")).toBe(false);
    expect(getSupportedCryptocurrencies().some(token => token.assetSymbol === "EURe")).toBe(false);
  });
});
