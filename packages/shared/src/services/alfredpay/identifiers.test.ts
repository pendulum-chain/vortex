import { describe, expect, test } from "bun:test";
import { isValidCuit, isValidCurp } from "./identifiers";

// Vectors checked against Alfred's sandbox on 2026-09-30: it accepted every "valid" value below
// and rejected the others with 110002 Invalid field(s).
describe("isValidCurp", () => {
  test("accepts CURPs with a correct check digit", () => {
    expect(isValidCurp("GOXM900520MDFMXR05")).toBe(true);
    expect(isValidCurp("OEAF771012HMCRGR08")).toBe(true);
  });

  test("rejects a wrong check digit, an INE number and lowercase input", () => {
    expect(isValidCurp("GOXM900520MDFMXR01")).toBe(false);
    // The widely published example CURP; its check digit is wrong.
    expect(isValidCurp("OEAF771012HMCRGR09")).toBe(false);
    expect(isValidCurp("1234567890123")).toBe(false);
    expect(isValidCurp("goxm900520mdfmxr05")).toBe(false);
  });
});

describe("isValidCuit", () => {
  test("accepts a CUIT with a correct check digit", () => {
    expect(isValidCuit("20123456786")).toBe(true);
  });

  test("rejects a wrong check digit, separators and the wrong length", () => {
    expect(isValidCuit("20123456789")).toBe(false);
    expect(isValidCuit("20-12345678-6")).toBe(false);
    expect(isValidCuit("2012345678")).toBe(false);
  });
});
