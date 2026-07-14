import { describe, expect, it } from "bun:test";
import { AlfredpayArgentinaDocumentType, AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import {
  arKycSchema,
  colKycSchema,
  kybFormSchema,
  mapKybFormValues,
  mxnKycSchema,
  toArPhoneNumber,
  toColPhoneNumber
} from "./schemas";

const mxn = {
  address: "Av. Reforma 1",
  city: "CDMX",
  dateOfBirth: "1990-05-04",
  dni: "OEAF771012HMCRGR09",
  email: "frida@example.com",
  firstName: "Frida",
  lastName: "Kahlo",
  state: "CDMX",
  zipCode: "06600"
};

const col = {
  address: "Cra 7 #1",
  city: "Bogotá",
  dateOfBirth: "1990-05-04",
  dni: "1234567890",
  firstName: "Gabriel",
  lastName: "García",
  phoneNumber: "+573000000000",
  state: "Cundinamarca",
  typeDocumentCol: AlfredpayColombiaDocumentType.CC,
  zipCode: "110111"
};

const ar = {
  address: "Av. Corrientes 1",
  city: "Buenos Aires",
  countryCode: "AR" as const,
  dateOfBirth: "1990-05-04",
  dni: "12345678",
  email: "jorge@example.com",
  firstName: "Jorge",
  lastName: "Borges",
  pep: false,
  phoneNumber: "+5491112345678",
  state: "CABA",
  typeDocumentAr: AlfredpayArgentinaDocumentType.DNI,
  zipCode: "C1043"
};

describe("mxnKycSchema", () => {
  it("accepts a complete Mexican submission", () => {
    expect(mxnKycSchema.safeParse(mxn).success).toBe(true);
  });

  it("rejects a date of birth that is not YYYY-MM-DD", () => {
    const result = mxnKycSchema.safeParse({ ...mxn, dateOfBirth: "04/05/1990" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(mxnKycSchema.safeParse({ ...mxn, email: "frida@" }).success).toBe(false);
  });
});

describe("colKycSchema", () => {
  it("accepts a complete Colombian submission", () => {
    expect(colKycSchema.safeParse(col).success).toBe(true);
  });

  // The superRefine: a cédula de ciudadanía is always exactly 10 digits.
  it("rejects a CC document number that is not exactly 10 digits", () => {
    const result = colKycSchema.safeParse({ ...col, dni: "123456789" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["dni"]);
  });

  it("allows a shorter number for a CE document", () => {
    const result = colKycSchema.safeParse({ ...col, dni: "123456", typeDocumentCol: AlfredpayColombiaDocumentType.CE });
    expect(result.success).toBe(true);
  });

  it("rejects a phone number without an international prefix", () => {
    expect(colKycSchema.safeParse({ ...col, phoneNumber: "3000000000" }).success).toBe(false);
  });
});

describe("arKycSchema", () => {
  it("accepts a complete Argentine submission", () => {
    expect(arKycSchema.safeParse(ar).success).toBe(true);
  });

  it("treats CUIT as optional but requires exactly 11 digits when present", () => {
    expect(arKycSchema.safeParse({ ...ar, cuit: "" }).success).toBe(true);
    expect(arKycSchema.safeParse({ ...ar, cuit: "20123456789" }).success).toBe(true);

    const result = arKycSchema.safeParse({ ...ar, cuit: "2012345678" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["cuit"]);
  });

  it("requires an Argentine phone prefix", () => {
    expect(arKycSchema.safeParse({ ...ar, phoneNumber: "+5491112345678" }).success).toBe(true);
    expect(arKycSchema.safeParse({ ...ar, phoneNumber: "+14155550100" }).success).toBe(false);
  });

  it("rejects nationalities that are not ISO-3166 alpha-2 codes", () => {
    expect(arKycSchema.safeParse({ ...ar, nationalities: ["AR"] }).success).toBe(true);
    expect(arKycSchema.safeParse({ ...ar, nationalities: ["arg"] }).success).toBe(false);
  });
});

describe("phone normalisers", () => {
  it("prefixes an Argentine local number with +54 and is idempotent", () => {
    expect(toArPhoneNumber("91112345678")).toBe("+5491112345678");
    // Re-running over its own output must not double the country code — the field
    // normalises on every keystroke, so it sees the previous result as input.
    expect(toArPhoneNumber("+5491112345678")).toBe("+5491112345678");
    expect(toArPhoneNumber(toArPhoneNumber("91112345678"))).toBe("+5491112345678");
  });

  it("keeps an Argentine number that already carries the country code", () => {
    expect(toArPhoneNumber("5491112345678")).toBe("+5491112345678");
  });

  it("passes an empty Argentine value straight through", () => {
    expect(toArPhoneNumber("")).toBe("");
  });

  it("prefixes a Colombian number with + and is idempotent", () => {
    expect(toColPhoneNumber("573000000000")).toBe("+573000000000");
    expect(toColPhoneNumber("+573000000000")).toBe("+573000000000");
    expect(toColPhoneNumber(toColPhoneNumber("573000000000"))).toBe("+573000000000");
  });

  it("strips separators typed into either field", () => {
    expect(toColPhoneNumber("+57 300 000 0000")).toBe("+573000000000");
    expect(toArPhoneNumber("54 9 11 1234-5678")).toBe("+5491112345678");
  });

  it("passes an empty Colombian value straight through", () => {
    expect(toColPhoneNumber("")).toBe("");
  });

  it("produces phone numbers the schemas accept", () => {
    expect(arKycSchema.safeParse({ ...ar, phoneNumber: toArPhoneNumber("91112345678") }).success).toBe(true);
    expect(colKycSchema.safeParse({ ...col, phoneNumber: toColPhoneNumber("573000000000") }).success).toBe(true);
  });
});

describe("kybFormSchema", () => {
  const kyb = {
    address: "Av. Reforma 1",
    businessName: "ACME Mexico",
    city: "CDMX",
    repDateOfBirth: "1985-02-14",
    repDni: "REP123",
    repEmail: "owner@acme.example",
    repFirstName: "Ada",
    repLastName: "Lovelace",
    repNationality: "MX",
    state: "CDMX",
    taxId: "ACM010101ABC",
    website: "https://acme.example",
    zipCode: "06600"
  };

  it("accepts a complete MX/CO company submission", () => {
    expect(kybFormSchema.safeParse(kyb).success).toBe(true);
  });

  it("rejects malformed representative and company fields", () => {
    expect(kybFormSchema.safeParse({ ...kyb, repDateOfBirth: "14/02/1985" }).success).toBe(false);
    expect(kybFormSchema.safeParse({ ...kyb, repEmail: "owner@" }).success).toBe(false);
    expect(kybFormSchema.safeParse({ ...kyb, repNationality: "Mexico" }).success).toBe(false);
    expect(kybFormSchema.safeParse({ ...kyb, website: "acme" }).success).toBe(false);
  });

  it("maps flat form values to the Alfredpay related-person payload", () => {
    expect(mapKybFormValues(kyb)).toEqual({
      address: "Av. Reforma 1",
      businessName: "ACME Mexico",
      city: "CDMX",
      relatedPersons: [
        {
          dateOfBirth: "1985-02-14",
          dni: "REP123",
          email: "owner@acme.example",
          firstName: "Ada",
          lastName: "Lovelace",
          nationalities: ["MX"]
        }
      ],
      state: "CDMX",
      taxId: "ACM010101ABC",
      website: "https://acme.example",
      zipCode: "06600"
    });
    expect(mapKybFormValues({ ...kyb, repDni: "" }).relatedPersons[0]?.dni).toBeUndefined();
  });
});
