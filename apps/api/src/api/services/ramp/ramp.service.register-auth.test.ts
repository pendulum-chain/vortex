import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { FiatToken } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";
import { RampService } from "./ramp.service";

// Locks in the user-gating guards at the top of RampService.registerRamp. See
// docs/architecture/user-gated-ramp-registration.md. The guards run before any DB write or
// signing-account validation, so overriding withTransaction (to skip the real DB) and mocking
// QuoteTicket.findByPk (plus the User lookup and one-active-ramp lock queries that follow the
// guards) is enough to drive them.
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
  const originalRampStateUpdate = RampState.update;
  const originalRampStateFindOne = RampState.findOne;

  User.findByPk = mock(async () => ({ id: "user-a" })) as unknown as typeof User.findByPk;
  RampState.update = mock(async () => [0]) as unknown as typeof RampState.update;
  RampState.findOne = mock(async () => null) as unknown as typeof RampState.findOne;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
  });

  afterAll(() => {
    User.findByPk = originalUserFindByPk;
    RampState.update = originalRampStateUpdate;
    RampState.findOne = originalRampStateFindOne;
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
});
