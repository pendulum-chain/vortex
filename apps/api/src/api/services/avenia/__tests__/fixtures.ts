import * as shared from "@vortexfi/shared";
import crypto from "crypto";

function generate() {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" }
  });
}

export const primaryKeys = generate();
export const rotatedKeys = generate();

// Bun's mock.module is process-global, so every test file that stubs @vortexfi/shared
// must stub it to the same thing or whichever file loads last wins. Both Avenia test
// files therefore share this one key server and flip `servedKey` per test instead.
export const keyServer = { servedKey: primaryKeys.publicKey };

export const getAveniaPublicKey = async (): Promise<string> => keyServer.servedKey;

// mock.module replaces the module for the whole process, so the real exports are spread
// back in: a bare stub would strip every other @vortexfi/shared export from any test file
// that happens to load after this one.
export const sharedModuleMock = () => ({
  ...shared,
  BrlaApiService: { getInstance: () => ({ getAveniaPublicKey }) }
});

const silence = () => undefined;

export const loggerModuleMock = () => ({
  default: { debug: silence, error: silence, info: silence, warn: silence }
});

/** Mirrors Avenia's documented signing: RSA-PSS over the raw body, SHA-256, max salt. */
export function sign(body: Buffer, key: string): string {
  return crypto
    .sign("sha256", body, {
      key,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
    })
    .toString("base64");
}
