import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync } from "crypto";
import { BrlaApiService } from "./brlaApiService";

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
  });
});

describe("BrlaApiService.sendRequest path templating", () => {
  // GetKybAttempt is "/v2/kyc/attempts/{attemptId}". Before templating, the path param
  // was appended, signing and requesting a literal "/{attemptId}/<id>" URL.
  it("interpolates the {attemptId} template instead of appending the path param", async () => {
    let requestedUrl: string | undefined;
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ attempt: { id: "attempt-9" } }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    });

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs1" },
      publicKeyEncoding: { format: "pem", type: "pkcs1" }
    });
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-api-key", privateKey });

    await service.getKybAttemptStatus("attempt-9");

    expect(requestedUrl).toContain("/v2/kyc/attempts/attempt-9");
    expect(requestedUrl).not.toContain("{attemptId}");
  });
});
