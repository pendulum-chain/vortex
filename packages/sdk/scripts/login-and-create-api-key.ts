// Headless api-key provisioning for authenticated SDK testing.
//
// Flow (all REST, no SDK):
//   1. POST /v1/auth/request-otp { email }            -> Supabase emails a one-time code
//   2. (prompt) read the 6-digit code from the inbox
//   3. POST /v1/auth/verify-otp { email, token }      -> { access_token, refresh_token, user_id }
//   4. POST /v1/api-keys { Authorization: Bearer ... } -> { publicKey, secretKey } (sk_* returned ONCE)
//   5. persist keys to .api-key.json for the next script
//
// The minted pair is user-scoped (partner_name = NULL): the X-API-Key header authenticates
// as the linked user on quote/ramp endpoints, with default `vortex` partner pricing.
//
// Run:
//   cd packages/sdk
//   bun run scripts/login-and-create-api-key.ts
//
// Env overrides:
//   API_BASE_URL        default http://localhost:3000
//   API_KEY_NAME        default sdk-test
//   API_KEY_OUTFILE     default .api-key.json

import * as fs from "fs";
import * as readline from "readline";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? "test@email.io";
const API_KEY_NAME = process.env.API_KEY_NAME ?? "sdk-test";
const API_KEY_OUTFILE = process.env.API_KEY_OUTFILE ?? ".api-key.json";

interface ApiKeyResponse {
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  publicKey: { id: string; key: string; keyPrefix: string; name: string; type: "public" };
  secretKey: { id: string; key: string; keyPrefix: string; name: string; type: "secret" };
}

interface VerifyOtpResponse {
  access_token: string;
  refresh_token: string;
  success: boolean;
  user_id: string;
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

async function postJson<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch(`${API_BASE_URL}/v1${path}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return JSON.parse(text) as T;
}

async function requestOtp(email: string): Promise<void> {
  console.log(`📨 Requesting OTP for ${email} ...`);
  const data = await postJson<{ message: string; success: boolean }>("/auth/request-otp", { email });
  console.log(`   ${data.message}`);
}

async function verifyOtp(email: string, token: string): Promise<VerifyOtpResponse> {
  return postJson<VerifyOtpResponse>("/auth/verify-otp", { email, token });
}

async function createApiKey(accessToken: string, name: string): Promise<ApiKeyResponse> {
  return postJson<ApiKeyResponse>("/api-keys", { name }, accessToken);
}

async function main(): Promise<void> {
  console.log(`API base URL: ${API_BASE_URL}`);
  console.log(`Test user:     ${TEST_USER_EMAIL}\n`);

  await requestOtp(TEST_USER_EMAIL);

  const token = await askQuestion("➡️  Enter the OTP code from the email: ");
  if (!token) throw new Error("No OTP code provided.");

  console.log("\n🔒 Verifying OTP ...");
  const auth = await verifyOtp(TEST_USER_EMAIL, token);
  console.log(`   user_id: ${auth.user_id}`);

  console.log(`\n🗝️  Creating user-scoped api-key "${API_KEY_NAME}" ...`);
  const keyPair = await createApiKey(auth.access_token, API_KEY_NAME);
  console.log("   publicKey:", keyPair.publicKey.key);
  console.log("   secretKey:", keyPair.secretKey.key, "  (shown once)");

  const out = {
    apiUrl: API_BASE_URL,
    createdAt: keyPair.createdAt,
    expiresAt: keyPair.expiresAt,
    name: API_KEY_NAME,
    publicKey: keyPair.publicKey.key,
    publicKeyId: keyPair.publicKey.id,
    secretKey: keyPair.secretKey.key,
    secretKeyId: keyPair.secretKey.id,
    userId: auth.user_id
  };
  fs.writeFileSync(API_KEY_OUTFILE, JSON.stringify(out, null, 2));
  console.log(`\n💾 Wrote ${API_KEY_OUTFILE} (consumed by test-authenticated-quote.ts)`);
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
