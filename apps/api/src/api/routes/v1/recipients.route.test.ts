import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import express from "express";
import recipientsRoutes from "./recipients.route";

describe("recipient routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use("/v1/recipients", recipientsRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}/v1/recipients`;
  });

  afterAll(() => server.close());

  it("rejects managed profile selection before recipient authentication", async () => {
    const response = await fetch(baseUrl, {
      headers: { "X-Managed-Profile-Id": "22222222-2222-4222-8222-222222222222" }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_UNSUPPORTED" } });
  });
});
