import { describe, expect, it } from "vitest";
import { SignInMessage } from "../helpers/siweMessageFormatter";
import { validateEmbeddedWalletSiweMessage } from "./embeddedWalletSiwe";

const address = "0x1111111111111111111111111111111111111111";
const domain = "widget.vortex.example";
const issuedAt = Date.parse("2026-08-07T10:00:00.000Z");
const expirationTime = Date.parse("2026-08-14T10:00:00.000Z");

function message(overrides: Partial<ConstructorParameters<typeof SignInMessage>[0]> = {}): string {
  return new SignInMessage({
    address,
    domain,
    expirationTime,
    issuedAt,
    nonce: "abc12345",
    scheme: "https",
    ...overrides
  }).toMessage();
}

describe("embedded wallet SIWE validation", () => {
  it("accepts only the canonical message for the active address and origin", () => {
    expect(validateEmbeddedWalletSiweMessage(message(), address, domain, issuedAt + 1_000)).toEqual({
      address,
      domain,
      expirationTime: "2026-08-14T10:00:00.000Z",
      issuedAt: "2026-08-07T10:00:00.000Z",
      nonce: "abc12345"
    });
  });

  it("rejects a different wallet or origin", () => {
    expect(() =>
      validateEmbeddedWalletSiweMessage(
        message({ address: "0x2222222222222222222222222222222222222222" }),
        address,
        domain,
        issuedAt
      )
    ).toThrow("does not match the active wallet");
    expect(() => validateEmbeddedWalletSiweMessage(message({ domain: "evil.example" }), address, domain, issuedAt)).toThrow(
      "does not match this Vortex origin"
    );
  });

  it("rejects non-canonical, expired, future, and overlong messages", () => {
    expect(() => validateEmbeddedWalletSiweMessage(`${message()}\nSign this too`, address, domain, issuedAt)).toThrow(
      "canonical Vortex sign-in message format"
    );
    expect(() => validateEmbeddedWalletSiweMessage(message(), address, domain, expirationTime)).toThrow("has expired");
    expect(() =>
      validateEmbeddedWalletSiweMessage(message({ issuedAt: issuedAt + 10 * 60 * 1000 }), address, domain, issuedAt)
    ).toThrow("issued in the future");
    expect(() =>
      validateEmbeddedWalletSiweMessage(
        message({ expirationTime: issuedAt + 8 * 24 * 60 * 60 * 1000 }),
        address,
        domain,
        issuedAt
      )
    ).toThrow("lifetime is invalid");
  });

  it("rejects malformed messages and weak nonces", () => {
    expect(() => validateEmbeddedWalletSiweMessage("please sign this", address, domain, issuedAt)).toThrow(
      "valid Vortex sign-in message"
    );
    expect(() => validateEmbeddedWalletSiweMessage(message({ nonce: "short" }), address, domain, issuedAt)).toThrow(
      "invalid nonce"
    );
  });
});
