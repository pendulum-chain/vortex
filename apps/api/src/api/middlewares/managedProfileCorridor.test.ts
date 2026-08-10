import { afterEach, describe, expect, it, mock } from "bun:test";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import {
  getManagedProfileAlfredpayCustomerType,
  getManagedProfileCountryCorridor,
  getManagedProfileLimitsCorridors,
  getManagedProfileQuoteCorridor,
  getManagedProfileRampCorridor
} from "./managedProfileCorridor";

const originalQuoteFindByPk = QuoteTicket.findByPk;
const originalRampFindByPk = RampState.findByPk;

afterEach(() => {
  QuoteTicket.findByPk = originalQuoteFindByPk;
  RampState.findByPk = originalRampFindByPk;
});

describe("getManagedProfileCountryCorridor", () => {
  it("accepts corridors served by Alfredpay", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "MX" }, query: {} } as never)).toBe("MX");
  });

  it("rejects supported countries served by another provider", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "BR" }, query: {} } as never)).toBeUndefined();
  });
});

describe("getManagedProfileAlfredpayCustomerType", () => {
  it("uses Alfredpay request types and defaults to individual", () => {
    expect(getManagedProfileAlfredpayCustomerType({ body: {}, query: {} } as never)).toBe("individual");
    expect(getManagedProfileAlfredpayCustomerType({ body: { type: "BUSINESS" }, query: {} } as never)).toBe("business");
    expect(getManagedProfileAlfredpayCustomerType({ body: { type: "unknown" }, query: {} } as never)).toBeUndefined();
  });
});

describe("getManagedProfileLimitsCorridors", () => {
  it("returns every requested limits corridor", () => {
    expect(getManagedProfileLimitsCorridors({ body: { corridors: ["BR", "MX"] } } as never)).toEqual(["BR", "MX"]);
  });

  it("rejects empty or unsupported corridor input", () => {
    expect(getManagedProfileLimitsCorridors({ body: { corridors: [] } } as never)).toBeUndefined();
    expect(getManagedProfileLimitsCorridors({ body: { corridors: ["EU"] } } as never)).toBeUndefined();
  });
});

describe("managed ramp corridor resolution", () => {
  it("derives register policy from the persisted quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({ inputCurrency: "ARS", outputCurrency: "USDC", rampType: "BUY" })) as never;

    expect(await getManagedProfileQuoteCorridor({ body: { quoteId: "quote-1" } } as never)).toBe("AR");
  });

  it("derives update and start policy from the ramp's persisted quote", async () => {
    RampState.findByPk = mock(async () => ({ quoteId: "quote-1" })) as never;
    QuoteTicket.findByPk = mock(async () => ({ inputCurrency: "USDC", outputCurrency: "ARS", rampType: "SELL" })) as never;

    expect(await getManagedProfileRampCorridor({ body: { rampId: "ramp-1" } } as never)).toBe("AR");
  });
});
