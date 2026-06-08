import { describe, expect, it } from "bun:test";
import { NextFunction, Request, Response } from "express";
import { getRequestDurationMs, requestContext } from "./requestContext";

describe("requestContext", () => {
  it("uses an incoming request ID and returns it in the response header", () => {
    const req = { headers: { "x-request-id": "req-123" } } as unknown as Request;
    const headers: Record<string, string> = {};
    const res = { setHeader: (key: string, value: string) => { headers[key] = value; } } as Response;
    let calledNext = false;
    const next: NextFunction = () => { calledNext = true; };

    requestContext(req, res, next);

    expect(req.requestId).toBe("req-123");
    expect(headers["X-Request-ID"]).toBe("req-123");
    expect(req.requestStartedAt).toBeNumber();
    expect(calledNext).toBe(true);
  });

  it.each(["x".repeat(129), "request id with spaces"])("rejects unsafe incoming request ID %p", requestId => {
    const req = { headers: { "x-request-id": requestId } } as unknown as Request;
    const headers: Record<string, string> = {};
    const res = { setHeader: (key: string, value: string) => { headers[key] = value; } } as Response;

    requestContext(req, res, () => {});

    expect(req.requestId).toBeDefined();
    expect(req.requestId).not.toBe(requestId);
    expect(req.requestId || "").toHaveLength(36);
    expect(headers["X-Request-ID"]).toBe(req.requestId || "");
  });

  it("calculates request duration when a start time exists", () => {
    const duration = getRequestDurationMs({ requestStartedAt: Date.now() - 5 });

    expect(duration).not.toBeNull();
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
