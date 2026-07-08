// List active user API keys (GET /v1/api-keys).
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

interface ApiKeyEntry {
  createdAt: string;
  expiresAt: string;
  id: string;
  isActive: boolean;
  key?: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  name: string;
  type: "public" | "secret";
  updatedAt: string;
}

interface ListApiKeysResponse {
  apiKeys: ApiKeyEntry[];
}

function loadAuthToken(): AuthToken {
  if (!fs.existsSync(AUTH_TOKEN_FILE)) {
    throw new Error(`No ${AUTH_TOKEN_FILE} found. Run scripts/login.ts first.`);
  }
  return JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, "utf-8")) as AuthToken;
}

async function main(): Promise<void> {
  const auth = loadAuthToken();

  console.log("📋 Fetching API keys ...");
  const response = await fetch(`${API_BASE_URL}/v1/api-keys`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} /v1/api-keys: ${text}`);
  }
  const data = JSON.parse(text) as ListApiKeysResponse;

  if (data.apiKeys.length === 0) {
    console.log("No active API keys found.");
    return;
  }

  console.log(`\n${data.apiKeys.length} active key(s):\n`);
  for (const key of data.apiKeys) {
    const typeLabel = key.type === "public" ? "PUBLIC (pk_*)" : "SECRET (sk_*)";
    const displayKey = key.key ?? "(only shown at creation)";
    console.log(`  ${key.id}`);
    console.log(`    Type:       ${typeLabel}`);
    console.log(`    Name:       ${key.name}`);
    console.log(`    Prefix:     ${key.keyPrefix}`);
    console.log(`    Key:        ${displayKey}`);
    console.log(`    Created:    ${key.createdAt}`);
    console.log(`    Expires:    ${key.expiresAt}`);
    console.log(`    Last used:  ${key.lastUsedAt ?? "never"}`);
    console.log(`    Active:     ${key.isActive}`);
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
