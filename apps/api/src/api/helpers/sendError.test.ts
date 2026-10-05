import { describe, expect, it } from "bun:test";
import express from "express";
import { sendError } from "./sendError";

describe("sendError", () => {
  it("sends the error envelope with the status mirrored in the body, keys in code/message/status order", async () => {
    const app = express();
    app.get("/conflict", (_req, res) => {
      sendError(res, 409, "SOME_CONFLICT", "Something conflicts");
    });

    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Could not bind test server");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/conflict`);
      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(await response.text()).toBe('{"error":{"code":"SOME_CONFLICT","message":"Something conflicts","status":409}}');
    } finally {
      server.close();
    }
  });

  it("returns the response so middlewares can `return sendError(...)`", () => {
    const res: Record<string, unknown> = {};
    res.status = () => res;
    res.json = () => res;

    expect(sendError(res as never, 400, "BAD", "bad")).toBe(res as never);
  });
});
