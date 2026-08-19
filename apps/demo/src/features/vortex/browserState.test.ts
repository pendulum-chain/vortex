import { describe, expect, it } from "bun:test";
import {
  clearPendingPayment,
  createAccessTokenProvider,
  loadAuthTokens,
  loadRampHistory,
  markRampStarted,
  storeAuthTokens,
  storeRampSnapshot,
  updateRampSnapshots,
  type StorageLike
} from "./browserState";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function expiredJwt(): string {
  const payload = btoa(JSON.stringify({ exp: 1 })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

describe("browser auth state", () => {
  it("stores auth tokens without identity fields", () => {
    const storage = new MemoryStorage();
    storeAuthTokens(storage, { accessToken: "access", refreshToken: "refresh" });

    expect(loadAuthTokens(storage)).toEqual({ accessToken: "access", refreshToken: "refresh" });
  });

  it("refreshes an expired access token and persists the rotation", async () => {
    const storage = new MemoryStorage();
    storeAuthTokens(storage, { accessToken: expiredJwt(), refreshToken: "old-refresh" });
    const fetcher = async () =>
      new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }), { status: 200 });

    const accessToken = await createAccessTokenProvider("https://api.example", storage, fetcher)();

    expect(accessToken).toBe("new-access");
    expect(loadAuthTokens(storage)).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" });
  });

  it("clears a session when its refresh token is rejected", async () => {
    const storage = new MemoryStorage();
    storeAuthTokens(storage, { accessToken: expiredJwt(), refreshToken: "rejected-refresh" });

    const accessToken = await createAccessTokenProvider(
      "https://api.example",
      storage,
      async () => new Response(null, { status: 401 })
    )();

    expect(accessToken).toBeNull();
    expect(loadAuthTokens(storage)).toBeNull();
  });

  it("refreshes a cached access token that is not a valid JWT", async () => {
    const storage = new MemoryStorage();
    storeAuthTokens(storage, { accessToken: "invalid", refreshToken: "refresh" });

    const accessToken = await createAccessTokenProvider(
      "https://api.example",
      storage,
      async () => new Response(JSON.stringify({ access_token: "valid", refresh_token: "rotated" }), { status: 200 })
    )();

    expect(accessToken).toBe("valid");
  });
});

describe("ramp history state", () => {
  it("deduplicates snapshots and updates their phases", () => {
    const storage = new MemoryStorage();
    const snapshot = {
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "initial",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-1",
      inputAmount: "100",
      outputAmount: "18.5"
    };

    storeRampSnapshot(storage, snapshot);
    storeRampSnapshot(storage, { ...snapshot, outputAmount: "19" });
    updateRampSnapshots(storage, [{ currentPhase: "complete", id: "ramp-1" }]);

    expect(loadRampHistory(storage)).toEqual([{ ...snapshot, currentPhase: "complete", outputAmount: "19" }]);
  });

  it("retains PIX instructions until the ramp starts", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, {
      awaitingPayment: true,
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "registered",
      depositQrCode: "pix-code",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-1",
      inputAmount: "100",
      outputAmount: "18.5"
    });

    expect(loadRampHistory(storage)[0]?.depositQrCode).toBe("pix-code");

    markRampStarted(storage, "ramp-1", "started");

    expect(loadRampHistory(storage)[0]).toMatchObject({ awaitingPayment: false, currentPhase: "started" });
    expect(loadRampHistory(storage)[0]?.depositQrCode).toBeUndefined();
  });

  it("discards only expired payment instructions while retaining ramp history", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, {
      awaitingPayment: true,
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "initial",
      depositQrCode: "expired-pix-code",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-1",
      inputAmount: "100",
      outputAmount: "18.5",
      status: "PENDING"
    });

    const history = clearPendingPayment(storage, "ramp-1");

    expect(history[0]).toMatchObject({ awaitingPayment: false, id: "ramp-1", status: "PENDING" });
    expect(history[0]?.depositQrCode).toBeUndefined();
  });

  it("clears payable PIX instructions when polling observes progress or failure", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, {
      awaitingPayment: true,
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "initial",
      depositQrCode: "pix-code",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-1",
      inputAmount: "100",
      outputAmount: "18.5",
      status: "PENDING"
    });

    const history = updateRampSnapshots(storage, [{ currentPhase: "initial", id: "ramp-1", status: "FAILED" }]);

    expect(history[0]).toMatchObject({ awaitingPayment: false, currentPhase: "initial", status: "FAILED" });
    expect(history[0]?.depositQrCode).toBeUndefined();
  });
});
