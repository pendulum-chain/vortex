import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { recoverAxelarStuckConfirm } from "./axelar";

const TX_HASH = "0x31365ff4337000801303097a0494fd97ecc1661ea84fedee801f01825b236f49";
const SIGNED_TX_BYTES = [10, 137, 1, 42, 0, 255];

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    json: async () => body,
    ok,
    status
  } as Response;
}

describe("recoverAxelarStuckConfirm", () => {
  it("decodes the relayer's numeric-keyed byte response and broadcasts it", async () => {
    // The signing relayer serializes the tx bytes as {"0": 10, "1": 137, ...}. The
    // official SDK mishandles exactly this shape and broadcasts an empty tx, so the
    // decode is the load-bearing part of this function.
    const numericKeyed: Record<string, number> = {};
    SIGNED_TX_BYTES.forEach((byte, index) => {
      numericKeyed[String(index)] = byte;
    });

    const fetchCalls: { url: string; body: unknown }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ body: JSON.parse(init?.body as string), url: String(url) });
      if (String(url).includes("confirm_gateway_tx")) {
        return jsonResponse({ data: numericKeyed });
      }
      return jsonResponse({ id: 1, jsonrpc: "2.0", result: { code: 0, hash: "ABC123" } });
    }) as typeof fetch;

    const hash = await recoverAxelarStuckConfirm(TX_HASH, "base");

    expect(hash).toBe("ABC123");
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain("axelar-signing-relayer-mainnet.axelar.dev/confirm_gateway_tx");
    expect(fetchCalls[0].body).toEqual({ chain: "base", module: "evm", txHash: TX_HASH });

    const expectedBase64 = btoa(String.fromCharCode(...SIGNED_TX_BYTES));
    expect(fetchCalls[1].body).toMatchObject({ method: "broadcast_tx_sync", params: { tx: expectedBase64 } });
  });

  it("accepts a plain byte array from the relayer", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      if (String(url).includes("confirm_gateway_tx")) {
        return jsonResponse({ data: SIGNED_TX_BYTES });
      }
      return jsonResponse({ id: 1, jsonrpc: "2.0", result: { code: 0, hash: "DEF456" } });
    }) as typeof fetch;

    await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).resolves.toBe("DEF456");
  });

  it("throws when the relayer returns an empty transaction instead of broadcasting it", async () => {
    globalThis.fetch = mock(async () => jsonResponse({ data: {} })) as typeof fetch;

    await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).rejects.toThrow("empty transaction");
  });

  it("ignores non-numeric keys in the relayer response", async () => {
    const fetchCalls: { url: string; body: unknown }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ body: JSON.parse(init?.body as string), url: String(url) });
      if (String(url).includes("confirm_gateway_tx")) {
        return jsonResponse({ data: { "0": 10, "1": 137, type: "Buffer" } });
      }
      return jsonResponse({ id: 1, jsonrpc: "2.0", result: { code: 0, hash: "GHI789" } });
    }) as typeof fetch;

    await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).resolves.toBe("GHI789");
    expect(fetchCalls[1].body).toMatchObject({ params: { tx: btoa(String.fromCharCode(10, 137)) } });
  });

  it("throws instead of broadcasting corrupted bytes when the relayer response has an unexpected shape", async () => {
    for (const data of [null, undefined, "not-bytes", { "0": 300 }, { "0": "10" }, [10, 1.5]]) {
      globalThis.fetch = mock(async () => jsonResponse({ data })) as typeof fetch;
      await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).rejects.toThrow(/unexpected response shape|invalid transaction bytes/);
    }
  });

  it("throws when the broadcast succeeds but the RPC response has no transaction hash", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      if (String(url).includes("confirm_gateway_tx")) {
        return jsonResponse({ data: SIGNED_TX_BYTES });
      }
      return jsonResponse({ id: 1, jsonrpc: "2.0", result: { code: 0 } });
    }) as typeof fetch;

    await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).rejects.toThrow("no transaction hash");
  });

  it("aborts the relayer call when the signal fires", async () => {
    globalThis.fetch = realFetch;
    const abortController = new AbortController();
    abortController.abort(new Error("Phase execution timed out"));

    // With an already-aborted signal, fetch must reject without any network I/O.
    await expect(recoverAxelarStuckConfirm(TX_HASH, "base", abortController.signal)).rejects.toThrow();
  });

  it("throws when the Axelar broadcast is rejected", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      if (String(url).includes("confirm_gateway_tx")) {
        return jsonResponse({ data: SIGNED_TX_BYTES });
      }
      return jsonResponse({ id: 1, jsonrpc: "2.0", result: { code: 18, log: "must contain at least one message" } });
    }) as typeof fetch;

    await expect(recoverAxelarStuckConfirm(TX_HASH, "base")).rejects.toThrow("code 18");
  });
});
