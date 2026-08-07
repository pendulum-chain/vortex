import * as shared from "@vortexfi/shared";
import crypto from "crypto";
import * as loggerModule from "../../../../config/logger";

function generate() {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" }
  });
}

export const primaryKeys = generate();
export const rotatedKeys = generate();

// Avenia's live endpoint serves PKCS#1 ("BEGIN RSA PUBLIC KEY"), not the SPKI the other
// fixtures use, so the verifier has to accept both encodings.
export const pkcs1Keys = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "pkcs1" }
});

// Bun's mock.module is process-global, so every test file that stubs @vortexfi/shared
// must stub it to the same thing or whichever file loads last wins. Both Avenia test
// files therefore share this one key server and flip `servedKey` per test instead.
// `calls` counts outbound key fetches, which is what the refresh bounding is about.
export const keyServer = { calls: 0, servedKey: primaryKeys.publicKey };

export const getAveniaPublicKey = async (): Promise<string> => {
  keyServer.calls += 1;
  return keyServer.servedKey;
};

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

// afterAll restore targets: mock.module is process-global, so each Avenia test file must
// put the real modules back when it finishes or its stubs poison every later file.
// Snapshotted HERE, at fixture load — before any mock.module call. mock.module mutates
// already-imported namespaces in place, so spreading `shared` at restore time would copy
// the stubs back instead of the real exports.
const sharedSnapshot = { ...shared };
const loggerSnapshot = { ...loggerModule };

export const sharedModuleReal = () => sharedSnapshot;

export const loggerModuleReal = () => loggerSnapshot;

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
