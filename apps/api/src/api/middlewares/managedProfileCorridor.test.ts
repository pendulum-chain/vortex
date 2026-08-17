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

  it("reads the country a GET handler will use", () => {
    expect(getManagedProfileCountryCorridor({ body: {}, query: { country: "MX" } } as never)).toBe("MX");
  });

  it("fails closed when query and body disagree", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "CO" }, query: { country: "MX" } } as never)).toBeUndefined();
    expect(getManagedProfileCountryCorridor({ body: { country: "MX" }, query: { country: "CO" } } as never)).toBeUndefined();
  });

  it("accepts an agreeing query and body", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "MX" }, query: { country: "MX" } } as never)).toBe("MX");
  });
});

describe("getManagedProfileAlfredpayCustomerType", () => {
  it("uses Alfredpay request types and defaults to individual", () => {
    expect(getManagedProfileAlfredpayCustomerType({ body: {}, query: {} } as never)).toBe("individual");
    expect(getManagedProfileAlfredpayCustomerType({ body: { type: "BUSINESS" }, query: {} } as never)).toBe("business");
    expect(getManagedProfileAlfredpayCustomerType({ body: { type: "unknown" }, query: {} } as never)).toBeUndefined();
  });

  it("fails closed when query and body disagree", () => {
    expect(
      getManagedProfileAlfredpayCustomerType({ body: { type: "BUSINESS" }, query: { type: "INDIVIDUAL" } } as never)
    ).toBeUndefined();
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
