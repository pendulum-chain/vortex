// Create a new public + secret API key pair (POST /v1/api-keys).
// Requires a valid auth token from scripts/login.ts.
//
// Run:
//   cd packages/sdk
//   bun run scripts/create-api-key.ts
//
// Env overrides:
//   API_BASE_URL        default http://localhost:3000
//   AUTH_TOKEN_FILE     default .auth-token.json
//   API_KEY_NAME        default sdk-test
//   API_KEY_OUTFILE     default .api-key.json

import * as fs from "fs";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const AUTH_TOKEN_FILE = process.env.AUTH_TOKEN_FILE ?? ".auth-token.json";
const API_KEY_NAME = process.env.API_KEY_NAME ?? "sdk-test";
const API_KEY_OUTFILE = process.env.API_KEY_OUTFILE ?? ".api-key.json";

interface AuthToken {
  accessToken: string;
  userId: string;
}

interface ApiKeyResponse {
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  publicKey: { id: string; key: string; keyPrefix: string; name: string; type: "public" };
  secretKey: { id: string; key: string; keyPrefix: string; name: string; type: "secret" };
}

function loadAuthToken(): AuthToken {
  if (!fs.existsSync(AUTH_TOKEN_FILE)) {
    throw new Error(`No ${AUTH_TOKEN_FILE} found. Run scripts/login.ts first.`);
  }
  return JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, "utf-8")) as AuthToken;
}

async function main(): Promise<void> {
  const auth = loadAuthToken();

  console.log(`🗝️  Creating api-key "${API_KEY_NAME}" ...`);
  const response = await fetch(`${API_BASE_URL}/v1/api-keys`, {
    body: JSON.stringify({ name: API_KEY_NAME }),
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} /v1/api-keys: ${text}`);
  }
  const keyPair = JSON.parse(text) as ApiKeyResponse;

  console.log("   publicKey:", keyPair.publicKey.key);
  console.log("   secretKey:", keyPair.secretKey.key, " (shown once)");

  const out = {
    apiUrl: API_BASE_URL,
    createdAt: keyPair.createdAt,
    expiresAt: keyPair.expiresAt,
    name: API_KEY_NAME,
    publicKey: keyPair.publicKey.key,
    publicKeyId: keyPair.publicKey.id,
    secretKey: keyPair.secretKey.key,
    secretKeyId: keyPair.secretKey.id,
    userId: auth.userId
  };
  fs.writeFileSync(API_KEY_OUTFILE, JSON.stringify(out, null, 2));
  console.log(`\n💾 Wrote ${API_KEY_OUTFILE}`);
}

if (import.meta.main) {
  main()
    .then(() => {
      console.log("\n✨ Done");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
