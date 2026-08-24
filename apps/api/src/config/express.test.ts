import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import app from "./express";

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
