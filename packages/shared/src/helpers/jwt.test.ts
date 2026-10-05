import { describe, expect, it } from "bun:test";
import { decodeJwtExpiryMs } from "./jwt";

const base64url = (value: string) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: unknown) => `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(payload))}.signature`;

describe("decodeJwtExpiryMs", () => {
  it("returns exp in epoch milliseconds", () => {
    expect(decodeJwtExpiryMs(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it("decodes unpadded base64url payloads containing url-safe characters", () => {
    // This payload's standard base64 contains "/", "+" and "==" padding, so base64url decoding must map and re-pad.
    const token = jwt({ exp: 1_800_000_000, note: "?>?>?>" });
    expect(token.split(".")[1]).toMatch(/[-_]/);
    expect(decodeJwtExpiryMs(token)).toBe(1_800_000_000_000);
  });

  it("returns null when exp is missing or not a number", () => {
    expect(decodeJwtExpiryMs(jwt({ sub: "user" }))).toBeNull();
    expect(decodeJwtExpiryMs(jwt({ exp: "1800000000" }))).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(decodeJwtExpiryMs("")).toBeNull();
    expect(decodeJwtExpiryMs("no-dots")).toBeNull();
    expect(decodeJwtExpiryMs("a.%%%.c")).toBeNull();
    expect(decodeJwtExpiryMs(`a.${base64url("not json")}.c`)).toBeNull();
  });
});
