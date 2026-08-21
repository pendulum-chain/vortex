import { describe, expect, it } from "bun:test";
import {
  clearPendingPayment,
  createAccessTokenProvider,
  jwtSubject,
  loadAuthTokens,
  loadRampHistory,
  markRampStarted,
  reconcileRampStart,
  storeAuthTokens,
  storeRampSnapshot,
  updateRampSnapshots,
  type StorageLike
} from "./browserState";

const SUBJECT = "user-a";

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

    storeRampSnapshot(storage, SUBJECT, snapshot);
    storeRampSnapshot(storage, SUBJECT, { ...snapshot, outputAmount: "19" });
    updateRampSnapshots(storage, SUBJECT, [{ currentPhase: "complete", id: "ramp-1" }]);

    expect(loadRampHistory(storage, SUBJECT)).toEqual([{ ...snapshot, currentPhase: "complete", outputAmount: "19" }]);
  });

  it("isolates ramp history and pending payments per authenticated subject", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, "user-a", {
      awaitingPayment: true,
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "initial",
      depositQrCode: "user-a-pix-code",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-a",
      inputAmount: "100",
      outputAmount: "18.5"
    });

    expect(loadRampHistory(storage, "user-b")).toEqual([]);
    expect(loadRampHistory(storage, "user-a")[0]?.depositQrCode).toBe("user-a-pix-code");
  });

  it("removes the legacy shared history key so pre-scoping data cannot leak", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "vortex-demo-history:v1",
      JSON.stringify([
        {
          awaitingPayment: true,
          createdAt: "2026-08-19T12:00:00.000Z",
          currentPhase: "initial",
          depositQrCode: "legacy-pix-code",
          expiresAt: "2026-08-19T12:15:00.000Z",
          id: "ramp-legacy",
          inputAmount: "100",
          outputAmount: "18.5"
        }
      ])
    );

    expect(loadRampHistory(storage, SUBJECT)).toEqual([]);
    expect(storage.getItem("vortex-demo-history:v1")).toBeNull();
  });

  it("retains PIX instructions until the ramp starts", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, {
      awaitingPayment: true,
      createdAt: "2026-08-19T12:00:00.000Z",
      currentPhase: "registered",
      depositQrCode: "pix-code",
      expiresAt: "2026-08-19T12:15:00.000Z",
      id: "ramp-1",
      inputAmount: "100",
      outputAmount: "18.5"
    });

    expect(loadRampHistory(storage, SUBJECT)[0]?.depositQrCode).toBe("pix-code");

    markRampStarted(storage, SUBJECT, "ramp-1", "started");

    expect(loadRampHistory(storage, SUBJECT)[0]).toMatchObject({ awaitingPayment: false, currentPhase: "started" });
    expect(loadRampHistory(storage, SUBJECT)[0]?.depositQrCode).toBeUndefined();
  });

  it("discards only expired payment instructions while retaining ramp history", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, {
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

    const history = clearPendingPayment(storage, SUBJECT, "ramp-1");

    expect(history[0]).toMatchObject({ awaitingPayment: false, id: "ramp-1", status: "PENDING" });
    expect(history[0]?.depositQrCode).toBeUndefined();
  });

  it("clears payable PIX instructions when polling observes progress or failure", () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, {
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

    const history = updateRampSnapshots(storage, SUBJECT, [{ currentPhase: "initial", id: "ramp-1", status: "FAILED" }]);

    expect(history[0]).toMatchObject({ awaitingPayment: false, currentPhase: "initial", status: "FAILED" });
    expect(history[0]?.depositQrCode).toBeUndefined();
  });
});

describe("lost start-response reconciliation", () => {
  const payableSnapshot = {
    awaitingPayment: true,
    createdAt: "2026-08-19T12:00:00.000Z",
    currentPhase: "initial",
    depositQrCode: "pix-code",
    expiresAt: "2026-08-19T12:15:00.000Z",
    id: "ramp-1",
    inputAmount: "100",
    outputAmount: "18.5",
    status: "PENDING"
  };

  it("clears the payable state when the server advanced despite the lost response", async () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, payableSnapshot);

    const history = await reconcileRampStart(storage, SUBJECT, "ramp-1", async () => ({
      currentPhase: "brlaTeleport",
      status: "PENDING"
    }));

    expect(history?.[0]).toMatchObject({ awaitingPayment: false, currentPhase: "brlaTeleport", status: "PENDING" });
    expect(history?.[0]?.depositQrCode).toBeUndefined();
    expect(loadRampHistory(storage, SUBJECT)[0]?.awaitingPayment).toBe(false);
  });

  it("keeps the payable state when the ramp is still initial so the user can retry", async () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, payableSnapshot);

    const history = await reconcileRampStart(storage, SUBJECT, "ramp-1", async () => ({
      currentPhase: "initial",
      status: "PENDING"
    }));

    expect(history).toBeNull();
    expect(loadRampHistory(storage, SUBJECT)[0]?.depositQrCode).toBe("pix-code");
  });

  it("keeps the payable state when the status check itself fails", async () => {
    const storage = new MemoryStorage();
    storeRampSnapshot(storage, SUBJECT, payableSnapshot);

    const history = await reconcileRampStart(storage, SUBJECT, "ramp-1", async () => {
      throw new Error("network down");
    });

    expect(history).toBeNull();
    expect(loadRampHistory(storage, SUBJECT)[0]?.depositQrCode).toBe("pix-code");
  });
});

describe("jwt subject extraction", () => {
  it("reads the sub claim used to scope history", () => {
    const payload = btoa(JSON.stringify({ exp: 1, sub: "user-a" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(jwtSubject(`header.${payload}.signature`)).toBe("user-a");
  });

  it("returns null for tokens without a usable sub claim", () => {
    expect(jwtSubject("not-a-jwt")).toBeNull();
    const payload = btoa(JSON.stringify({ exp: 1 })).replace(/=/g, "");
    expect(jwtSubject(`header.${payload}.signature`)).toBeNull();
  });
});
