import crypto from "crypto";
import logger from "./logger";

export interface RSAKeyPair {
  privateKey: string;
  publicKey: string;
}

export class CryptoService {
  private static instance: CryptoService;
  private keyPair: RSAKeyPair | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Initialize or load RSA key pair
   */
  public initializeKeys(): void {
    try {
      const privateKeyPem = process.env.WEBHOOK_PRIVATE_KEY;
      const publicKeyPem = process.env.WEBHOOK_PUBLIC_KEY;

      if (privateKeyPem && publicKeyPem) {
        this.keyPair = {
          privateKey: privateKeyPem,
          publicKey: publicKeyPem
        };
        logger.info("RSA keys loaded from environment variables");
        return;
      }

      logger.warn("RSA keys not found in environment, generating new key pair");
      this.generateKeyPair();
    } catch (error) {
      logger.error("Failed to initialize RSA keys:", error);
      throw new Error("RSA key initialization failed");
    }
  }

  /**
   * Generate a new RSA key pair (2048-bit)
   */
  private generateKeyPair(): void {
    try {
      const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
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

      this.keyPair = {
        privateKey,
        publicKey
      };
    } catch (error) {
      logger.error("Failed to generate RSA key pair:", error);
      throw new Error("RSA key generation failed");
    }
  }

  /**
   * Get the public key in PEM format
   */
  public getPublicKey(): string {
    if (!this.keyPair) {
      throw new Error("RSA keys not initialized. Call initializeKeys() first.");
    }
    return this.keyPair.publicKey;
  }

  /**
   * Get the private key for signing (internal use only)
   */
  private getPrivateKey(): string {
    if (!this.keyPair) {
      throw new Error("RSA keys not initialized. Call initializeKeys() first.");
    }
    return this.keyPair.privateKey;
  }

  /**
   * Sign a payload using RSA-PSS with SHA-256
   * Returns base64-encoded signature
   */
  public signPayload(payload: string): string {
    try {
      const privateKey = this.getPrivateKey();

      const signature = crypto.sign("sha256", Buffer.from(payload, "utf8"), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
      });

      return signature.toString("base64");
    } catch (error) {
      logger.error("Failed to sign payload:", error);
      throw new Error("Payload signing failed");
    }
  }

  /**
   * Verify a signature (for testing purposes)
   * In production, this would be done by webhook consumers using the public key
   */
  public verifySignature(payload: string, signatureBase64: string): boolean {
    try {
      const publicKey = this.getPublicKey();
      const signature = Buffer.from(signatureBase64, "base64");

      return crypto.verify(
        "sha256",
        Buffer.from(payload, "utf8"),
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
        },
        signature
      );
    } catch (error) {
      logger.error("Failed to verify signature:", error);
      return false;
    }
  }
}

export default CryptoService.getInstance();
