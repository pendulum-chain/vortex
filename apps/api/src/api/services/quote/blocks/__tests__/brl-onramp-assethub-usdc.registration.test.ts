import { afterAll, describe, expect, it, mock } from "bun:test";
import * as aveniaAccountNamespace from "../../../avenia-account";
import * as rampServiceNamespace from "../../../ramp/ramp.service";
import { EphemeralAccountType } from "@vortexfi/shared";

const aveniaAccountReal = { ...aveniaAccountNamespace };
const rampServiceReal = { ...rampServiceNamespace };

mock.module("../../../avenia-account", () => ({
  ...aveniaAccountReal,
  resolveAveniaAccountForRamp: async () => ({ taxId: "12345678901" })
}));
mock.module("../../../ramp/ramp.service", () => ({
  ...rampServiceReal,
  default: {
    validateBrlaOnrampRequest: async () => ({ aveniaTicketId: "ticket-1", brCode: "pix-code" })
  }
}));

const { AveniaMoonbeamMint } = await import("../phases/avenia-moonbeam-mint");

afterAll(() => {
  mock.module("../../../avenia-account", () => ({ ...aveniaAccountReal }));
  mock.module("../../../ramp/ramp.service", () => ({ ...rampServiceReal }));
});

describe("BRL AssetHub Avenia registration", () => {
  it("owns the derived tax ID, ticket, and PIX artifact", async () => {
    const result = await AveniaMoonbeamMint.register!({
      authenticatedUser: { id: "user-1" },
      input: { taxId: "123.456.789-01" },
      metadata: {} as never,
      quote: { inputAmount: "100" } as never,
      signingAccounts: [
        { address: "0xevm", type: EphemeralAccountType.EVM },
        { address: "5substrate", type: EphemeralAccountType.Substrate }
      ]
    });
    expect(result).toEqual({
      facts: { aveniaTicketId: "ticket-1", taxId: "12345678901" },
      responseArtifacts: { depositQrCode: "pix-code" }
    });
  });
});
