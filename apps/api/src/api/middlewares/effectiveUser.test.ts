import {describe, expect, it} from "bun:test";
import {getEffectiveUserId, setApiKeyUserId} from "./effectiveUser";

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
  it("prefers req.userId (Supabase) over req.apiKeyUserId", () => {
    expect(getEffectiveUserId(fakeReq({userId: "supabase-user", apiKeyUserId: "key-user"}))).toBe(
      "supabase-user"
    );
  });

  it("falls back to req.apiKeyUserId when no Supabase user", () => {
    expect(getEffectiveUserId(fakeReq({apiKeyUserId: "key-user"}))).toBe("key-user");
  });

  it("returns undefined when no identity is present", () => {
    expect(getEffectiveUserId(fakeReq())).toBeUndefined();
  });
});

describe("setApiKeyUserId", () => {
  it("sets req.apiKeyUserId from a non-empty string", () => {
    const req: {userId?: string; apiKeyUserId?: string} = {};
    setApiKeyUserId(req as never, "key-user");
    expect(req.apiKeyUserId).toBe("key-user");
  });

  it("does not set req.apiKeyUserId when value is null", () => {
    const req: {userId?: string; apiKeyUserId?: string} = {};
    setApiKeyUserId(req as never, null);
    expect(req.apiKeyUserId).toBeUndefined();
  });

  it("does not set req.apiKeyUserId when value is undefined", () => {
    const req: {userId?: string; apiKeyUserId?: string} = {};
    setApiKeyUserId(req as never, undefined);
    expect(req.apiKeyUserId).toBeUndefined();
  });
});
