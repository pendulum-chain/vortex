import { getAddress } from "viem";
import { SignInMessage } from "../helpers/siweMessageFormatter";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_LOGIN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000;
const SIWE_NONCE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

interface ValidatedEmbeddedWalletSiweMessage {
  address: string;
  domain: string;
  expirationTime: string;
  issuedAt: string;
  nonce: string;
}

export function validateEmbeddedWalletSiweMessage(
  message: string,
  expectedAddress: string,
  expectedDomain: string,
  now = Date.now()
): ValidatedEmbeddedWalletSiweMessage {
  let parsed: SignInMessage;
  try {
    parsed = SignInMessage.fromMessage(message);
  } catch {
    throw new Error("Embedded wallets may only sign a valid Vortex sign-in message");
  }

  if (parsed.toMessage() !== message) {
    throw new Error("Embedded wallets may only sign the canonical Vortex sign-in message format");
  }

  try {
    if (getAddress(parsed.address) !== getAddress(expectedAddress)) {
      throw new Error("Embedded wallet sign-in address does not match the active wallet");
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("does not match")) throw cause;
    throw new Error("Embedded wallet sign-in message contains an invalid address");
  }

  if (parsed.domain !== expectedDomain) {
    throw new Error("Embedded wallet sign-in domain does not match this Vortex origin");
  }
  if (!SIWE_NONCE_PATTERN.test(parsed.nonce)) {
    throw new Error("Embedded wallet sign-in message contains an invalid nonce");
  }

  const parsedIssuedAt = parsed.issuedAt;
  if (!parsedIssuedAt) {
    throw new Error("Embedded wallet sign-in message contains invalid timestamps");
  }
  const issuedAt = Date.parse(parsedIssuedAt);
  const expirationTime = Date.parse(parsed.expirationTime);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expirationTime)) {
    throw new Error("Embedded wallet sign-in message contains invalid timestamps");
  }
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) {
    throw new Error("Embedded wallet sign-in message was issued in the future");
  }
  if (expirationTime <= now) {
    throw new Error("Embedded wallet sign-in message has expired");
  }
  if (expirationTime <= issuedAt || expirationTime - issuedAt > MAX_LOGIN_LIFETIME_MS) {
    throw new Error("Embedded wallet sign-in message lifetime is invalid");
  }

  return {
    address: parsed.address,
    domain: parsed.domain,
    expirationTime: parsed.expirationTime,
    issuedAt: parsedIssuedAt,
    nonce: parsed.nonce
  };
}
