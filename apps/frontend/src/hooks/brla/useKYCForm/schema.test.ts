import { describe, expect, it } from "vitest";
import { createKycFormSchema } from "./index";

const t = (key: string) => key;

const VALID_KYC_DATA = {
  birthdate: "1990-01-01",
  cep: "01001-000",
  city: "Sao Paulo",
  email: "maria@example.com",
  fullName: "Maria Silva",
  number: "100",
  pixId: "maria@example.com",
  state: "SP",
  street: "Rua Augusta",
  taxId: "529.982.247-25"
};

describe("createKycFormSchema", () => {
  describe("quoted flow (kybLinkMode = false)", () => {
    it("accepts a CPF or a CNPJ and requires the quote-supplied PIX key", () => {
      const schema = createKycFormSchema(t, false);

      expect(schema.safeParse(VALID_KYC_DATA).success).toBe(true);
      expect(schema.safeParse({ ...VALID_KYC_DATA, taxId: "12345678000195" }).success).toBe(true);
      expect(schema.safeParse({ ...VALID_KYC_DATA, pixId: "" }).success).toBe(false);
    });
  });

  // Regression: the invite deep link has no quote, so there is no PIX key to require, and the
  // tax ID typed on the form must be a CPF — a CNPJ belongs to the KYB flow.
  describe("invite deep link (kybLinkMode = true)", () => {
    it("requires a CPF and rejects a CNPJ", () => {
      const schema = createKycFormSchema(t, true);

      expect(schema.safeParse(VALID_KYC_DATA).success).toBe(true);
      expect(schema.safeParse({ ...VALID_KYC_DATA, taxId: "12345678000195" }).success).toBe(false);
      expect(schema.safeParse({ ...VALID_KYC_DATA, taxId: "" }).success).toBe(false);
    });

    it("allows an empty PIX key", () => {
      const schema = createKycFormSchema(t, true);

      expect(schema.safeParse({ ...VALID_KYC_DATA, pixId: "" }).success).toBe(true);
    });
  });
});
