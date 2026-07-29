import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "./auth";

const originalLocalStorage = globalThis.localStorage;
const values = new Map<string, string>();
const localStorageMock: Storage = {
  clear: () => values.clear(),
  getItem: key => values.get(key) ?? null,
  key: index => [...values.keys()][index] ?? null,
  get length() {
    return values.size;
  },
  removeItem: key => values.delete(key),
  setItem: (key, value) => values.set(key, value)
};

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageMock });

describe("dashboard auth session bridge", () => {
  beforeEach(() => values.clear());

  after(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  });

  it("notifies subscribers for login, token refresh storage, and logout", () => {
    let notifications = 0;
    const unsubscribe = AuthService.subscribe(() => {
      notifications += 1;
    });
    const tokens = {
      accessToken: "access-one",
      refreshToken: "refresh-one",
      userId: "user-one"
    };

    AuthService.storeTokens(tokens);
    AuthService.storeTokens({ ...tokens, accessToken: "access-two" });
    AuthService.clearTokens();
    unsubscribe();
    AuthService.storeTokens(tokens);

    assert.equal(notifications, 3);
  });

  it("returns the current JWT to CDP while it remains fresh", async () => {
    const accessToken = "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature";
    AuthService.storeTokens({ accessToken, refreshToken: "refresh", userId: "user" });

    assert.equal(await AuthService.getFreshAccessToken(), accessToken);
  });
});
