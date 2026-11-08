import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { AccessTokenVerificationError, SupabaseAuthService } from "../api/services/auth";
import app from "./express";
import logger from "./logger";

describe("full Express app", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => server.close());

  /** Returns the request-log line containing `marker` written for a request to `path`. */
  async function loggedLine(path: string, marker: string, init?: RequestInit): Promise<string | undefined> {
    const written: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      await response.text();
      await new Promise(resolve => setTimeout(resolve, 50));
    } finally {
      process.stdout.write = originalWrite;
    }
    return written.find(entry => entry.includes(marker));
  }

  it("logs request paths without their query string", async () => {
    const line = await loggedLine("/v1/request-log-probe?taxId=00000000191", "/v1/request-log-probe");
    expect(line).toBeDefined();
    expect(line).not.toContain("00000000191");
  });

  it("logs recipient invite paths without their token", async () => {
    const line = await loggedLine("/v1/recipients/invite/invite-token-secret-123/accept", "/v1/recipients/invite/", {
      method: "POST"
    });
    expect(line).toContain("/v1/recipients/invite/:token/accept");
    expect(line).not.toContain("invite-token-secret-123");
  });

  it("keeps the recipient invite token out of the auth verification-failure log", async () => {
    const verify = spyOn(SupabaseAuthService, "verifyToken").mockRejectedValue(
      new AccessTokenVerificationError("provider unavailable", true)
    );
    const warn = spyOn(logger, "warn");
    try {
      const response = await fetch(`${baseUrl}/v1/recipients/invite/invite-token-secret-456/accept`, {
        headers: { Authorization: "Bearer valid-looking" },
        method: "POST"
      });
      expect(response.status).toBe(503);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain("/v1/recipients/invite/:token/accept");
      expect(logged).not.toContain("invite-token-secret-456");
    } finally {
      verify.mockRestore();
      warn.mockRestore();
    }
  });

  it("applies Helmet to the auth-first token import route", async () => {
    const response = await fetch(`${baseUrl}/v1/brla/kyc/import-token`, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED", status: 401 } });
  });
});
