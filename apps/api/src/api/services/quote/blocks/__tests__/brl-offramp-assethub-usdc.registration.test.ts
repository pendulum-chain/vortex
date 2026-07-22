import { afterAll, describe, expect, it, mock } from "bun:test";
import * as aveniaAccountNamespace from "../../../avenia-account";
import * as rampServiceNamespace from "../../../ramp/ramp.service";

const aveniaAccountReal = { ...aveniaAccountNamespace };
const rampServiceReal = { ...rampServiceNamespace };
const validationCalls: unknown[][] = [];

mock.module("../../../avenia-account", () => ({
  ...aveniaAccountReal,
  resolveAveniaAccountForRamp: async () => ({ taxId: "12345678901" })
}));
mock.module("../../../ramp/ramp.service", () => ({
  ...rampServiceReal,
  default: {
    validateBrlaOfframpRequest: async (...args: unknown[]) => {
      validationCalls.push(args);
      return { brCode: "trusted-code", wallets: { evm: "0x1111111111111111111111111111111111111111" } };
    }
  }
}));

const { AveniaPendulumOfframp } = await import("../phases/avenia-pendulum-offramp");

afterAll(() => {
  mock.module("../../../avenia-account", () => ({ ...aveniaAccountReal }));
  mock.module("../../../ramp/ramp.service", () => ({ ...rampServiceReal }));
});

describe("AssetHub BRL payout registration", () => {
  it("derives identity and trusted payout wallet while validating PIX ownership and limits", async () => {
    const result = await AveniaPendulumOfframp.register!({
      authenticatedUser: { id: "user-1" },
      input: { pixDestination: "pix-key", receiverTaxId: "123.456.789-00", taxId: "client-value" },
      metadata: {} as never,
      quote: { outputAmount: "499.25" } as never,
      signingAccounts: []
    });
    expect(validationCalls.at(-1)).toEqual(["12345678901", "pix-key", "12345678900", "499.25"]);
    expect(result).toEqual({
      facts: {
        brlaEvmAddress: "0x1111111111111111111111111111111111111111",
        pixDestination: "pix-key",
        receiverTaxId: "12345678900",
        taxId: "12345678901"
      },
      responseArtifacts: { depositQrCode: "trusted-code" }
    });
  });
});
