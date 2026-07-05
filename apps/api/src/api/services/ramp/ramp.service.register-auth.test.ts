import { afterEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import { APIError } from "../../errors/api-error";
import { RampService } from "./ramp.service";

// Locks in the user-gating guards at the top of RampService.registerRamp. See
// docs/architecture/user-gated-ramp-registration.md. The guards run before any DB write or
// signing-account validation, so overriding withTransaction (to skip the real DB) and mocking
// QuoteTicket.findByPk is enough to drive them.
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

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
  });

  it("lets an authenticated caller claim an anonymous quote (passes the user-gating guards)", async () => {
    stubQuote({ userId: null });
    const service = new TestRampService();
    try {
      await service.registerRamp({ additionalData: {}, quoteId: "quote-1", signingAccounts: [], userId: "user-a" } as never);
      throw new Error("registerRamp did not reject");
    } catch (error) {
      // The stubbed quote has no currencies/signing accounts, so registration fails later
      // (missing destinationAddress) — but it must get past the gating guards.
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).not.toBe(httpStatus.FORBIDDEN);
      expect((error as APIError).message).not.toContain("Invalid quote");
    }
  });

  it("rejects a user registering a quote owned by a different user with 403", async () => {
    stubQuote({ userId: "user-b" });
    await expectRegisterError("user-a", httpStatus.FORBIDDEN);
  });

  it("rejects registration with no effective user (e.g. unlinked partner key) with 400", async () => {
    stubQuote({ userId: null });
    await expectRegisterError(undefined, httpStatus.BAD_REQUEST);
  });
});
