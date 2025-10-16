import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import crypto from "crypto";
import { CryptoService } from "./crypto";

describe("CryptoService - Public Key Derivation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should derive public key from private key when only WEBHOOK_PRIVATE_KEY is provided", () => {
    // Generate a test key pair
    const { privateKey, publicKey: expectedPublicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs8"
      },
      publicKeyEncoding: {
        format: "pem",
        type: "spki"
      }
    });

    // Set only the private key in environment
    process.env.WEBHOOK_PRIVATE_KEY = privateKey;
    delete process.env.WEBHOOK_PUBLIC_KEY;

    // Create a new instance and initialize
    const cryptoService = new (CryptoService as any)();
    cryptoService.initializeKeys();

    // Get the derived public key
    const derivedPublicKey = cryptoService.getPublicKey();

    // Verify it matches the expected public key
    expect(derivedPublicKey).toBe(expectedPublicKey);
  });

  it("should be able to sign and verify with derived public key", () => {
    // Generate a test key pair
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs8"
      },
      publicKeyEncoding: {
        format: "pem",
        type: "spki"
      }
    });

    // Set only the private key in environment
    process.env.WEBHOOK_PRIVATE_KEY = privateKey;
    delete process.env.WEBHOOK_PUBLIC_KEY;

    // Create a new instance and initialize
    const cryptoService = new (CryptoService as any)();
    cryptoService.initializeKeys();

    // Test signing and verification
    const testPayload = JSON.stringify({ test: "data", timestamp: Date.now() });
    const signature = cryptoService.signPayload(testPayload);
    const isValid = cryptoService.verifySignature(testPayload, signature);

    expect(isValid).toBe(true);
  });

  it("should generate new key pair when WEBHOOK_PRIVATE_KEY is not provided", () => {
    delete process.env.WEBHOOK_PRIVATE_KEY;
    delete process.env.WEBHOOK_PUBLIC_KEY;

    const cryptoService = new (CryptoService as any)();
    cryptoService.initializeKeys();

    // Should have generated keys
    const publicKey = cryptoService.getPublicKey();
    expect(publicKey).toBeTruthy();
    expect(publicKey).toContain("BEGIN PUBLIC KEY");

    // Should be able to sign and verify
    const testPayload = "test";
    const signature = cryptoService.signPayload(testPayload);
    const isValid = cryptoService.verifySignature(testPayload, signature);
    expect(isValid).toBe(true);
  });
});
