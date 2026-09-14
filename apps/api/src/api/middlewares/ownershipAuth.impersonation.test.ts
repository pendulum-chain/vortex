import { afterEach, describe, expect, it, mock } from "bun:test";
import RampState from "../../models/rampState.model";
import { assertRampOwnership } from "./ownershipAuth";

// Impersonation only substitutes the principal at the bearer-token seam (req.userId becomes
// the target's profile id); ownership checks never see `req.impersonation` itself. These tests
// confirm the target's rights apply, and only the target's.
describe("assertRampOwnership under impersonation", () => {
  const originalRampFindByPk = RampState.findByPk;

  afterEach(() => {
    RampState.findByPk = originalRampFindByPk;
  });

  const impersonation = {
    actorProfileId: "operator-1",
    expiresAt: new Date(Date.now() + 60_000),
    sessionId: "session-1",
    targetEmail: "target@example.com",
    targetProfileId: "target-user"
  };

  it("allows an impersonated request to access a ramp owned by the target", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: "target-user"
    })) as typeof RampState.findByPk;

    await expect(
      assertRampOwnership({ impersonation, userId: "target-user" } as never, "ramp-1")
    ).resolves.toBeUndefined();
  });

  it("denies an impersonated request access to a ramp owned by an unrelated third profile", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: "unrelated-third-profile"
    })) as typeof RampState.findByPk;

    await expect(
      assertRampOwnership({ impersonation, userId: "target-user" } as never, "ramp-1")
    ).rejects.toThrow("Authenticated user does not own this ramp");
  });
});
