// Standalone OTP login — saves auth token for reuse by other scripts.
//
// Flow:
//   1. POST /v1/auth/request-otp { email }
//   2. (prompt) read the 6-digit code from the inbox
//   3. POST /v1/auth/verify-otp { email, token } -> { access_token, refresh_token, user_id }
//   4. persist to .auth-token.json
//
// Run:
//   cd packages/sdk
//   bun run scripts/login.ts
//
// Env overrides:
//   API_BASE_URL        default http://localhost:3000
//   TEST_USER_EMAIL     default test@email.io
//   AUTH_TOKEN_FILE     default .auth-token.json

import * as fs from "fs";
import * as readline from "readline";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? "test@email.io";
const AUTH_TOKEN_FILE = process.env.AUTH_TOKEN_FILE ?? ".auth-token.json";

interface VerifyOtpResponse {
  access_token: string;
  refresh_token: string;
  success: boolean;
  user_id: string;
}

interface AuthToken {
  accessToken: string;
  apiUrl: string;
  refreshToken: string;
  userId: string;
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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/v1${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return JSON.parse(text) as T;
}

async function main(): Promise<void> {
  console.log(`API base URL: ${API_BASE_URL}`);
  console.log(`User:          ${TEST_USER_EMAIL}\n`);

  console.log("📨 Requesting OTP ...");
  const data = await postJson<{ message: string; success: boolean }>("/auth/request-otp", { email: TEST_USER_EMAIL });
  console.log(`   ${data.message}`);

  const otp = await askQuestion("➡️  Enter the OTP code from the email: ");
  if (!otp) throw new Error("No OTP code provided.");

  console.log("\n🔒 Verifying OTP ...");
  const auth = await postJson<VerifyOtpResponse>("/auth/verify-otp", { email: TEST_USER_EMAIL, token: otp });
  console.log(`   user_id: ${auth.user_id}`);

  const out: AuthToken = {
    accessToken: auth.access_token,
    apiUrl: API_BASE_URL,
    refreshToken: auth.refresh_token,
    userId: auth.user_id
  };
  fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify(out, null, 2));
  console.log(`\n💾 Wrote ${AUTH_TOKEN_FILE}`);
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
