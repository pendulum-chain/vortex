// List active user API credentials (GET /v1/api-credentials).
// Requires a valid auth token from scripts/login.ts.
//
// Run:
//   cd packages/sdk
//   bun run scripts/fetch-api-keys.ts
//
// Env overrides:
//   API_BASE_URL        default http://localhost:3000
//   AUTH_TOKEN_FILE     default .auth-token.json

import * as fs from "fs";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const AUTH_TOKEN_FILE = process.env.AUTH_TOKEN_FILE ?? ".auth-token.json";

interface AuthToken {
  accessToken: string;
}

interface ApiCredential {
  createdAt: string;
  expiresAt: string;
  id: string;
  name: string;
  publicKey: string;
  publicLastUsedAt: string | null;
  revokedAt: string | null;
  secretKeyPrefix: string;
  secretLastUsedAt: string | null;
}

interface ListApiCredentialsResponse {
  apiCredentials: ApiCredential[];
}

function loadAuthToken(): AuthToken {
  if (!fs.existsSync(AUTH_TOKEN_FILE)) {
    throw new Error(`No ${AUTH_TOKEN_FILE} found. Run scripts/login.ts first.`);
  }
  return JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, "utf-8")) as AuthToken;
}

async function main(): Promise<void> {
  const auth = loadAuthToken();

  console.log("📋 Fetching API credentials ...");
  const response = await fetch(`${API_BASE_URL}/v1/api-credentials`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} /v1/api-credentials: ${text}`);
  }
  const data = JSON.parse(text) as ListApiCredentialsResponse;

  if (data.apiCredentials.length === 0) {
    console.log("No API credentials found.");
    return;
  }

  console.log(`\n${data.apiCredentials.length} credential(s):\n`);
  for (const credential of data.apiCredentials) {
    console.log(`  ${credential.id}`);
    console.log(`    Name:             ${credential.name}`);
    console.log(`    Public key:       ${credential.publicKey}`);
    console.log(`    Secret prefix:    ${credential.secretKeyPrefix}`);
    console.log(`    Created:          ${credential.createdAt}`);
    console.log(`    Expires:          ${credential.expiresAt}`);
    console.log(`    Public last used: ${credential.publicLastUsedAt ?? "never"}`);
    console.log(`    Secret last used: ${credential.secretLastUsedAt ?? "never"}`);
    console.log(`    Revoked:          ${credential.revokedAt ?? "no"}`);
    console.log();
  }
}

if (import.meta.main) {
  main()
    .then(() => {
      console.log("✨ Done");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
