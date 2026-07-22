import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AlfredpayFiatAccountType } from "@vortexfi/shared";
import { buildFiatAccountSchema, toAddFiatAccountRequest } from "./fiatAccounts";

describe("fiat account validation", () => {
  it("accepts valid details for every AlfredPay corridor", () => {
    assert.equal(
      buildFiatAccountSchema("MX").safeParse({ accountName: "Maria", accountNumber: "646180157000000004" }).success,
      true
    );
    assert.equal(
      buildFiatAccountSchema("CO").safeParse({
        accountBankCode: "Bancolombia",
        accountName: "Maria",
        accountNumber: "12345678901",
        accountType: "AHORRO",
        documentNumber: "123456789",
        documentType: "CC"
      }).success,
      true
    );
    assert.equal(
      buildFiatAccountSchema("US").safeParse({
        accountBankCode: "Example Bank",
        accountNumber: "12345678",
        accountType: "CHECKING",
        routingNumber: "021000021"
      }).success,
      true
    );
    assert.equal(
      buildFiatAccountSchema("AR").safeParse({ accountNumber: "maria.alias", accountType: "ALIAS" }).success,
      true
    );
  });

  it("rejects invalid corridor-specific account and routing numbers", () => {
    assert.equal(buildFiatAccountSchema("MX").safeParse({ accountName: "Maria", accountNumber: "123" }).success, false);
    assert.equal(
      buildFiatAccountSchema("CO").safeParse({
        accountBankCode: "Bank",
        accountName: "Maria",
        accountNumber: "123456789",
        accountType: "AHORRO",
        documentNumber: "123",
        documentType: "CC"
      }).success,
      false
    );
    assert.equal(
      buildFiatAccountSchema("US").safeParse({
        accountBankCode: "Bank",
        accountNumber: "12345678",
        accountType: "CHECKING",
        routingNumber: "123"
      }).success,
      false
    );
  });
});

describe("toAddFiatAccountRequest", () => {
  it("maps self accounts to each provider method", () => {
    const cases = [
      ["MX", AlfredpayFiatAccountType.SPEI],
      ["CO", AlfredpayFiatAccountType.ACH],
      ["US", AlfredpayFiatAccountType.BANK_USA],
      ["AR", AlfredpayFiatAccountType.COELSA]
    ] as const;

    for (const [corridorId, type] of cases) {
      assert.deepEqual(toAddFiatAccountRequest(corridorId, { accountNumber: "123" }), {
        accountBankCode: undefined,
        accountName: undefined,
        accountNumber: "123",
        accountType: undefined,
        country: corridorId,
        documentNumber: undefined,
        documentType: undefined,
        isExternal: false,
        routingNumber: undefined,
        type
      });
    }
  });
});
