import { describe, expect, it } from "bun:test";
import { isValidCnpj, isValidCpf, normalizeTaxId } from "./helpers";

describe("isValidCpf", () => {
  it("accepts a checksum-valid CPF in digits-only and formatted form", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("08786985906")).toBe(true);
  });

  it("rejects CPFs with wrong check digits", () => {
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    // shape-valid, non-trivial, but the verifier digits don't match
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("rejects trivial patterns", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
    expect(isValidCpf("12345678901")).toBe(false);
    expect(isValidCpf("98765432109")).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isValidCpf("")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("529982247255")).toBe(false);
    expect(isValidCpf("529.982.24725")).toBe(false);
    expect(isValidCpf("abc.def.ghi-jk")).toBe(false);
    // a valid CNPJ is not a CPF
    expect(isValidCpf("12345678000195")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("accepts a checksum-valid CNPJ in digits-only and formatted form", () => {
    expect(isValidCnpj("12345678000195")).toBe(true);
    expect(isValidCnpj("12.345.678/0001-95")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejects CNPJs with wrong check digits", () => {
    expect(isValidCnpj("12345678000199")).toBe(false);
    expect(isValidCnpj("12.345.678/0001-99")).toBe(false);
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  it("rejects trivial patterns", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isValidCnpj("")).toBe(false);
    expect(isValidCnpj("1234567800019")).toBe(false);
    expect(isValidCnpj("123456780001955")).toBe(false);
    // a valid CPF is not a CNPJ
    expect(isValidCnpj("52998224725")).toBe(false);
  });
});

describe("normalizeTaxId", () => {
  it("strips all non-digit characters", () => {
    expect(normalizeTaxId("529.982.247-25")).toBe("52998224725");
    expect(normalizeTaxId("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizeTaxId("52998224725")).toBe("52998224725");
  });
});
