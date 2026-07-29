import { describe, expect, it } from "bun:test";
import { readJwtMetadata } from "./jwtMetadata";

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

describe("JWT metadata", () => {
  it("reads only the signing metadata needed by the spike", () => {
    const token = `${encode({ alg: "ES256", kid: "key-1" })}.${encode({
      iss: "https://example.supabase.co/auth/v1",
      sub: "user-1"
    })}.signature`;

    expect(readJwtMetadata(token)).toEqual({
      algorithm: "ES256",
      issuer: "https://example.supabase.co/auth/v1",
      keyId: "key-1"
    });
  });

  it("rejects a value that is not a JWT", () => {
    expect(() => readJwtMetadata("not-a-jwt")).toThrow("Vortex access token is not a JWT");
  });
});
