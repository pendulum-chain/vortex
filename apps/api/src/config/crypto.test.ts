import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import crypto from "crypto";
import { CryptoService } from "./crypto";
import { config } from "./vars";

describe("CryptoService - Public Key Derivation", () => {
  // initializeKeys() reads config.secrets.webhookPrivateKey — the snapshot of
  // WEBHOOK_PRIVATE_KEY taken when vars.ts was imported. Mutating process.env
  // here is inert, so the tests inject through the config object instead.
  let originalWebhookPrivateKey: string | undefined;

  beforeEach(() => {
    originalWebhookPrivateKey = config.secrets.webhookPrivateKey;
  });

  afterEach(() => {
    config.secrets.webhookPrivateKey = originalWebhookPrivateKey;
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

    // Inject only the private key through the config snapshot
    config.secrets.webhookPrivateKey = privateKey;

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

    // Inject only the private key through the config snapshot
    config.secrets.webhookPrivateKey = privateKey;

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
    config.secrets.webhookPrivateKey = undefined;

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
