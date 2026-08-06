import {describe, expect, it} from "bun:test";
import {getAuthenticatedProfileId, getEffectiveUserId} from "./effectiveUser";

function fakeReq({userId, apiKeyUserId}: {userId?: string; apiKeyUserId?: string} = {}): {
  userId?: string;
  apiKeyUserId?: string;
} {
  const req: {userId?: string; apiKeyUserId?: string} = {};
  if (userId !== undefined) {
    req.userId = userId;
  }
  if (apiKeyUserId !== undefined) {
    req.apiKeyUserId = apiKeyUserId;
  }
  return req;
}

describe("getEffectiveUserId", () => {
  it("prefers req.userId (Supabase) over the credential subject", () => {
    expect(
      getEffectiveUserId({
        credential: { credentialId: "credential-1", environment: "test", partnerId: null, profileId: "key-user", strength: "secret" },
        userId: "supabase-user"
      } as never)
    ).toBe("supabase-user");
  });

  it("uses the credential subject when no Supabase user is present", () => {
    expect(
      getEffectiveUserId({
        credential: { credentialId: "credential-1", environment: "test", partnerId: null, profileId: "key-user", strength: "secret" }
      } as never)
    ).toBe("key-user");
  });

  it("uses a verified managed profile subject without replacing the authenticated actor", () => {
    expect(
      getEffectiveUserId({
        managedProfileContext: {
          actorProfileId: "manager-user",
          customerEntityId: "entity-1",
          managedProfileId: "relationship-1",
          subjectProfileId: "managed-user"
        },
        userId: "manager-user"
      } as never)
    ).toBe("managed-user");
  });

  it("returns undefined when no identity is present", () => {
    expect(getEffectiveUserId(fakeReq())).toBeUndefined();
  });

  it("ignores the legacy API key user field", () => {
    expect(getEffectiveUserId(fakeReq({ apiKeyUserId: "legacy-user" }) as never)).toBeUndefined();
  });
});

describe("getAuthenticatedProfileId", () => {
  it("uses the Supabase-authenticated profile", () => {
    expect(getAuthenticatedProfileId({ userId: "supabase-user" })).toBe("supabase-user");
  });

  it("uses the profile explicitly authenticated by secret-credential middleware", () => {
    expect(getAuthenticatedProfileId({ authenticatedCredentialProfileId: "credential-user" })).toBe("credential-user");
  });

  it("does not infer authentication from credential metadata", () => {
    expect(
      getAuthenticatedProfileId({
        credential: {
          credentialId: "credential-1",
          environment: "test",
          partnerId: null,
          profileId: "credential-user",
          strength: "secret"
        }
      } as never)
    ).toBeUndefined();
  });
});
