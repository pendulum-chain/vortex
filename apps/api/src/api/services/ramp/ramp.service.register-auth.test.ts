import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import sequelize from "../../../config/database";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import PartnerManagedProfile from "../../../models/partnerManagedProfile.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";
import { RampService } from "./ramp.service";

// Locks in the user-gating guards at the top of RampService.registerRamp. See
// docs/adr-0001-user-gated-ramp-registration.md. The guards run before any DB write or
// signing-account validation, so overriding withTransaction (to skip the real DB) and mocking
// QuoteTicket.findByPk and the User lookup are enough to drive them.
class TestRampService extends RampService {
  protected async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    return callback({} as Transaction);
  }
}

function stubQuote(overrides: { userId: string | null }): void {
  QuoteTicket.findByPk = mock(async () => ({
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    flowVariant: config.flowVariant,
    id: "quote-1",
    inputCurrency: FiatToken.EURC,
    status: "pending",
    userId: overrides.userId
  })) as unknown as typeof QuoteTicket.findByPk;
}

function stubMoonbeamQuote(): void {
  QuoteTicket.findByPk = mock(async () => ({
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    flowVariant: config.flowVariant,
    from: EPaymentMethod.PIX,
    id: "quote-1",
    inputCurrency: FiatToken.BRL,
    metadata: {
      blocks: {},
      flow: { id: "BrlOnrampAssethubUsdc" },
      globals: { fees: { usd: {} }, request: {} }
    },
    outputCurrency: "USDC",
    rampType: RampDirection.BUY,
    status: "pending",
    to: Networks.AssetHub,
    userId: "user-a"
  })) as unknown as typeof QuoteTicket.findByPk;
}

async function expectRegisterError(userId: string | undefined, expectedStatus: number): Promise<APIError> {
  const service = new TestRampService();
  try {
    await service.registerRamp({ additionalData: {}, quoteId: "quote-1", signingAccounts: [], userId } as never);
    throw new Error("registerRamp did not reject");
  } catch (error) {
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe(expectedStatus);
    return error as APIError;
  }
}

describe("RampService.registerRamp user gating", () => {
  const originalFindByPk = QuoteTicket.findByPk;
  const originalUserFindByPk = User.findByPk;
  const originalManagedProfileFindOne = PartnerManagedProfile.findOne;
  const originalQuery = sequelize.query;
  const queryMock = mock(async () => []);

  User.findByPk = mock(async () => ({ id: "user-a" })) as unknown as typeof User.findByPk;
  PartnerManagedProfile.findOne = mock(async () => null) as unknown as typeof PartnerManagedProfile.findOne;
  sequelize.query = queryMock as unknown as typeof sequelize.query;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
    PartnerManagedProfile.findOne = mock(async () => null) as unknown as typeof PartnerManagedProfile.findOne;
    queryMock.mockClear();
  });

  afterAll(() => {
    User.findByPk = originalUserFindByPk;
    PartnerManagedProfile.findOne = originalManagedProfileFindOne;
    sequelize.query = originalQuery;
  });

  it("lets an authenticated caller claim an anonymous quote (passes the user-gating guards)", async () => {
    stubQuote({ userId: null });
    const service = new TestRampService();
    try {
      await service.registerRamp({ additionalData: {}, quoteId: "quote-1", signingAccounts: [], userId: "user-a" } as never);
      throw new Error("registerRamp did not reject");
    } catch (error) {
      // The EUR kill switch runs after the user guards and before flow preparation, so this
      // proves the anonymous quote was claimable without requiring unrelated flow metadata.
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(httpStatus.SERVICE_UNAVAILABLE);
      expect((error as APIError).message).not.toContain("Invalid quote");
    }
  });

  it("rejects a user registering a quote owned by a different user with 403", async () => {
    stubQuote({ userId: "user-b" });
    await expectRegisterError("user-a", httpStatus.FORBIDDEN);
  });

  it("rejects registration with no effective user (e.g. unlinked partner key) with 400", async () => {
    stubQuote({ userId: null });
    const error = await expectRegisterError(undefined, httpStatus.BAD_REQUEST);
    // Pin the guard's own message: without it, registration still fails later with a
    // different 400 (missing destinationAddress), which must not satisfy this test.
    expect(error.message).toContain("requires an API key linked to a user");
  });

  it("rejects technical managed profiles before ramp preparation", async () => {
    stubQuote({ userId: null });
    PartnerManagedProfile.findOne = mock(async () => ({ id: "managed-1" })) as unknown as typeof PartnerManagedProfile.findOne;

    const error = await expectRegisterError("user-a", httpStatus.FORBIDDEN);
    expect(error.type).toBe("TECHNICAL_PROFILE_NOT_RAMP_ELIGIBLE");
  });

  it("rejects Moonbeam-dependent quotes before ephemeral freshness queries", async () => {
    stubMoonbeamQuote();

    const error = await expectRegisterError("user-a", httpStatus.SERVICE_UNAVAILABLE);

    expect(error.message).toContain("Moonbeam-dependent ramps are unavailable");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported recipient-directed payout context instead of silently treating it as self-offramp data", async () => {
    const service = new TestRampService();

    await expect(
      service.registerRamp({
        additionalData: { senderRecipientId: "relationship-1" },
        quoteId: "quote-1",
        signingAccounts: [],
        userId: "user-a"
      } as never)
    ).rejects.toMatchObject({
      message: expect.stringContaining("Recipient-directed payout is not supported"),
      status: httpStatus.BAD_REQUEST
    });
  });
});
