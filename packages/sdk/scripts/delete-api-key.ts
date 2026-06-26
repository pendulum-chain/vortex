// Delete (revoke) a user API key pair (DELETE /v1/api-keys/:keyId).
// Requires a valid auth token from scripts/login.ts.
//
// Select a key; if its paired counterpart (same base name, opposite type) exists,
// the script asks whether to delete both together.
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

interface ApiKeyEntry {
  id: string;
  key?: string;
  name: string;
  type: "public" | "secret";
}

interface ListApiKeysResponse {
  apiKeys: ApiKeyEntry[];
}

function stripSuffix(name: string): string {
  return name.replace(/\s*\((Public|Secret)\)$/, "");
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
    console.log("No active API keys to delete.");
    return;
  }

  console.log("\nActive keys:\n");
  data.apiKeys.forEach((key, i) => {
    const typeLabel = key.type === "public" ? "PUBLIC" : "SECRET";
    const displayKey = key.key ?? "(hidden)";
    console.log(`  ${i + 1}. [${key.id}] ${typeLabel} ${key.name} — ${displayKey}`);
  });

  const choice = await askQuestion(`\n➡️  Enter the number (1-${data.apiKeys.length}) of the key to delete: `);
  const index = Number.parseInt(choice, 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= data.apiKeys.length) {
    throw new Error(`Invalid selection: "${choice}"`);
  }

  const selected = data.apiKeys[index];
  const baseName = stripSuffix(selected.name);
  const paired = data.apiKeys.find(k => k.id !== selected.id && k.type !== selected.type && stripSuffix(k.name) === baseName);

  let publicKeyId: string | undefined;
  let keyId = selected.id;

  if (paired) {
    const typeLabel = paired.type === "public" ? "PUBLIC" : "SECRET";
    console.log(`\n🔗 Found paired ${typeLabel} key: ${paired.id} (${paired.name})`);

    const deleteBoth = await askQuestion("➡️  Delete both as a pair? (y/N): ");
    if (deleteBoth.toLowerCase() === "y") {
      publicKeyId = selected.type === "secret" ? paired.id : selected.id;
      keyId = selected.type === "secret" ? selected.id : paired.id;
      console.log(`\n🗑️  Revoking key pair: ${keyId} + ${publicKeyId}`);
    }
  }

  if (!publicKeyId) {
    console.log(`\n🗑️  Revoking key: ${selected.id} (${selected.type} — ${selected.name})`);
  }

  const deleteResponse = await fetch(`${API_BASE_URL}/v1/api-keys/${keyId}`, {
    body: publicKeyId ? JSON.stringify({ publicKeyId }) : undefined,
    headers: {
      ...(publicKeyId ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${auth.accessToken}`
    },
    method: "DELETE"
  });
  if (!deleteResponse.ok) {
    const errText = await deleteResponse.text();
    throw new Error(`${deleteResponse.status} /v1/api-keys/${keyId}: ${errText}`);
  }
  console.log(publicKeyId ? "✅ Key pair revoked." : "✅ Key revoked.");
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
