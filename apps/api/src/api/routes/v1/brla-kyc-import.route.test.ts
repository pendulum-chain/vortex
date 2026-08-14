import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { converter, handler, notFound } from "../../middlewares/error";
import { SupabaseAuthService } from "../../services/auth";
import brlaKycImportRoutes from "./brla-kyc-import.route";

describe("POST /v1/brla/kyc/import-token", () => {
  let server: ReturnType<typeof express.application.listen>;
  let url: string;

  beforeAll(() => {
    const app = express();
    app.use("/v1/brla/kyc/import-token", brlaKycImportRoutes);
    app.use(converter);
    app.use(notFound);
    app.use(handler);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    url = `http://127.0.0.1:${address.port}/v1/brla/kyc/import-token`;
  });

  afterEach(() => mock.restore());
  afterAll(() => server.close());

  it("authenticates before parsing malformed JSON", async () => {
    const response = await postMalformedJson();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED", status: 401 } });
  });

  it("returns 400 for malformed JSON after authentication", async () => {
    authenticate();

    const response = await postMalformedJson({ Authorization: "Bearer valid-token" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 400,
      message: "Invalid JSON payload",
      statusCode: 400,
      type: "entity.parse.failed"
    });
  });

  it("returns 413 for an authenticated body over the route limit", async () => {
    authenticate();

    const response = await fetch(url, {
      body: JSON.stringify({ consentAttested: true, importToken: "a".repeat(17 * 1024) }),
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: 413,
      message: "Request body too large",
      statusCode: 413,
      type: "entity.too.large"
    });
  });

  it("continues to run the existing validator for parsed JSON", async () => {
    authenticate();

    const response = await fetch(url, {
      body: JSON.stringify({ consentAttested: true, importToken: "token" }),
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Idempotency-Key must contain 1 to 128 visible ASCII characters" });
  });

  it("allows JSON escaping overhead for a token at the validator limit", async () => {
    authenticate();

    const response = await fetch(url, {
      body: JSON.stringify({ consentAttested: false, importToken: "\u0001".repeat(1024) }),
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "request-1"
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "consentAttested must be true" });
  });

  it("does not parse non-JSON request bodies", async () => {
    authenticate();

    const response = await fetch(url, {
      body: "importToken=token&consentAttested=true",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "request-1"
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "importToken must contain between 1 and 1024 bytes" });
  });

  function authenticate(): void {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: "user-1", valid: true });
  }

  function postMalformedJson(headers: Record<string, string> = {}): Promise<Response> {
    return fetch(url, {
      body: "{",
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST"
    });
  }
});
