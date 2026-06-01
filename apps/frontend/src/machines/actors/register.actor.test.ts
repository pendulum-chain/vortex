import { FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { describe, expect, it } from "vitest";
import { RampContext } from "../types";
import { buildRegisterRampAdditionalData, RegisterRampError, RegisterRampErrorType } from "./registerAdditionalData";

const baseContext = {
  connectedWalletAddress: "0x1111111111111111111111111111111111111111",
  externalSessionId: "session-1",
  executionInput: {
    fiatToken: FiatToken.EURC,
    network: Networks.Base,
    quote: {
      id: "quote-1",
      rampType: RampDirection.SELL
    },
    sourceOrDestinationAddress: "0x2222222222222222222222222222222222222222"
  },
  paymentData: undefined,
  userEmail: "user@example.com"
} as unknown as RampContext;

describe("buildRegisterRampAdditionalData", () => {
  it("passes email and destination address for Mykobo EUR offramps", () => {
    expect(buildRegisterRampAdditionalData(baseContext, baseContext.connectedWalletAddress as string)).toMatchObject({
      destinationAddress: "0x2222222222222222222222222222222222222222",
      email: "user@example.com",
      sessionId: "session-1",
      walletAddress: "0x1111111111111111111111111111111111111111"
    });
  });

  it("rejects Mykobo EUR offramps without an email", () => {
    expect(() =>
      buildRegisterRampAdditionalData(
        {
          ...baseContext,
          userEmail: undefined
        },
        baseContext.connectedWalletAddress as string
      )
    ).toThrow(new RegisterRampError("User email is required for Mykobo EUR offramp.", RegisterRampErrorType.InvalidInput));
  });
});
