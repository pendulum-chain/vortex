import { afterEach, describe, expect, it, mock } from "bun:test";
import { AVENIA_PUBLIC_KEY_TIMEOUT_MS, BrlaApiService } from "./brlaApiService";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("BrlaApiService.getAveniaPublicKey", () => {
  it("bounds the public-key request with an abort signal", async () => {
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ publicKey: "test-public-key" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    });

    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;

    await expect(service.getAveniaPublicKey()).resolves.toBe("test-public-key");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(AVENIA_PUBLIC_KEY_TIMEOUT_MS).toBe(10_000);
  });
});
