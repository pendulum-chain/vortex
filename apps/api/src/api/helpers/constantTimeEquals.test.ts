import { describe, expect, it } from "bun:test";
import { constantTimeEquals } from "./constantTimeEquals";

describe("constantTimeEquals", () => {
  it("is true only for identical bytes", () => {
    expect(constantTimeEquals(Buffer.from("secret"), Buffer.from("secret"))).toBe(true);
    expect(constantTimeEquals(Buffer.from("secret"), Buffer.from("secreT"))).toBe(false);
    expect(constantTimeEquals(Buffer.from([]), Buffer.from([]))).toBe(true);
  });

  it("returns false instead of throwing when the lengths differ", () => {
    expect(constantTimeEquals(Buffer.from("secret"), Buffer.from("secret!"))).toBe(false);
    expect(constantTimeEquals(Buffer.from("secret!"), Buffer.from("secret"))).toBe(false);
    expect(constantTimeEquals(Buffer.from("secret"), Buffer.from([]))).toBe(false);
    expect(constantTimeEquals(Buffer.from([]), Buffer.from("secret"))).toBe(false);
  });
});
