// Delete (revoke) a user API credential (DELETE /v1/api-credentials/:credentialId).
// Requires a valid auth token from scripts/login.ts.
//
// Run:
//   cd packages/sdk
//   bun run scripts/delete-api-key.ts
//
// Env overrides:
//   API_BASE_URL        default http://localhost:3000
//   AUTH_TOKEN_FILE     default .auth-token.json

import * as fs from "fs";
import * as readline from "readline";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const AUTH_TOKEN_FILE = process.env.AUTH_TOKEN_FILE ?? ".auth-token.json";

interface AuthToken {
  accessToken: string;
}

interface ApiCredential {
  id: string;
  name: string;
  publicKey: string;
  secretKeyPrefix: string;
}

interface ListApiCredentialsResponse {
  apiCredentials: ApiCredential[];
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, (ans: string) => {
      rl.close();
      resolve(ans.trim());
    });
  });
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
    console.log("No API credentials to delete.");
    return;
  }

  console.log("\nAPI credentials:\n");
  data.apiCredentials.forEach((credential, i) => {
    console.log(`  ${i + 1}. [${credential.id}] ${credential.name} — ${credential.publicKey} / ${credential.secretKeyPrefix}`);
  });

  const choice = await askQuestion(`\n➡️  Enter the number (1-${data.apiCredentials.length}) to revoke: `);
  const index = Number.parseInt(choice, 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= data.apiCredentials.length) {
    throw new Error(`Invalid selection: "${choice}"`);
  }

  const selected = data.apiCredentials[index];
  console.log(`\n🗑️  Revoking credential: ${selected.id} (${selected.name})`);

  const deleteResponse = await fetch(`${API_BASE_URL}/v1/api-credentials/${selected.id}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    method: "DELETE"
  });
  if (!deleteResponse.ok) {
    const errText = await deleteResponse.text();
    throw new Error(`${deleteResponse.status} /v1/api-credentials/${selected.id}: ${errText}`);
  }
  console.log("✅ Credential revoked.");
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
