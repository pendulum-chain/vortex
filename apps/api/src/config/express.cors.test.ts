import { describe, expect, it, mock } from "bun:test";
import cors from "cors";
import { corsOptions } from "./corsConfig";

describe("managed-profile CORS preflight", () => {
  it("allows browser managers to send the managed-profile selector", async () => {
    const headers = new Map<string, string>();
    let statusCode = 200;
    let finish: () => void = () => undefined;
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const request = {
      headers: {
        "access-control-request-headers": "x-managed-profile-id,x-api-key",
        "access-control-request-method": "GET",
        origin: "http://localhost:5173"
      },
      method: "OPTIONS"
    };
    const response = {
      end: mock(() => finish()),
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), String(value)),
      get statusCode() {
        return statusCode;
      },
      set statusCode(value: number) {
        statusCode = value;
      }
    };

    cors(corsOptions)(request as never, response as never, mock(() => undefined));
    await finished;

    expect(statusCode).toBe(204);
    expect(headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const allowedHeaders = headers.get("access-control-allow-headers")?.toLowerCase().split(",") ?? [];
    expect(allowedHeaders).toContain("x-managed-profile-id");
    expect(allowedHeaders).toContain("x-api-key");
    expect(allowedHeaders).toContain("authorization");
  });
});
