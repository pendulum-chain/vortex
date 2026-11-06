import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../src/vortex/api.js";
import { VORTEX_SESSION_KEY, createVortexSession } from "../src/vortex/session.js";
import { inOneHour, json, jwt, memoryStorage, withFetch } from "./helpers.mjs";

const DID_A = "did:privy:fake-test-only-a";
const DID_B = "did:privy:fake-test-only-b";
const api = createApi({ apiBase: "https://api.example.test" });

function setup(options = {}) {
  const backing = memoryStorage();
  const session = createVortexSession({ api, storage: () => backing, ...options });
  return { backing, session };
}

test("the session lives under Gold's key, in this tab's sessionStorage by default", () => {
  assert.equal(VORTEX_SESSION_KEY, "satoshi:vortex-session:v2");
  const originalWindow = globalThis.window;
  const tab = memoryStorage();
  try {
    globalThis.window = { sessionStorage: tab };
    createVortexSession({ api }).set({ access_token: jwt(inOneHour()), refresh_token: "fake-test-only" });
    assert.equal(JSON.parse(tab.getItem("satoshi:vortex-session:v2")).refresh_token, "fake-test-only");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("a localStorage backend can be injected (flag B2, off by default)", () => {
  const browserWide = memoryStorage();
  createVortexSession({ api, storage: () => browserWide }).set({ accessToken: "fake-test-only" });
  assert.equal(JSON.parse(browserWide.getItem(VORTEX_SESSION_KEY)).access_token, "fake-test-only");
});

test("set normalises token names and rejects a response without an access token", () => {
  const { session } = setup();
  assert.equal(session.set({ accessToken: "a-fake-test-only", refreshToken: "r-fake-test-only" }).refresh_token, "r-fake-test-only");
  assert.throws(() => session.set({ refresh_token: "fake-test-only" }), { code: "INVALID_SESSION" });
});

test("clear() removes only the shared session key", () => {
  const { backing, session } = setup();
  backing.setItem("satoshi:gold:active-ramp:v1", "{\"rampId\":\"r1\"}");
  session.set({ access_token: "fake-test-only" });
  session.clear();
  assert.equal(backing.getItem(VORTEX_SESSION_KEY), null);
  assert.equal(backing.getItem("satoshi:gold:active-ramp:v1"), "{\"rampId\":\"r1\"}");
});

test("the e-mail code is requested in Brazilian Portuguese (Gold fix bc6ac9828)", async () => {
  const { session } = setup();
  let body;
  await withFetch(async (url, init) => { assert.match(url, /\/v1\/auth\/request-otp$/); body = JSON.parse(init.body); return json({ success: true }); }, () => session.requestOtp(" Ana@Example.com "));
  assert.deepEqual(body, { email: "ana@example.com", locale: "pt-BR" });
});

test("verifying the code stores the e-mail and binds the session to the Privy user", async () => {
  const { session } = setup({ now: () => 1_000 });
  let body;
  await withFetch(async (url, init) => { body = JSON.parse(init.body); return json({ access_token: jwt(inOneHour()), refresh_token: "fake-test-only" }); }, () => session.verifyOtp(" Ana@Example.com ", "12-34 56", { privyDid: DID_A }));
  assert.deepEqual(body, { email: "ana@example.com", token: "123456" });
  assert.equal(session.get().email, "ana@example.com");
  assert.equal(session.get().privyDid, DID_A);
  assert.equal(session.get().boundAt, 1_000);
});

test("hasSession rule 1: no stored session, or no Privy user, reuses nothing", () => {
  const { session } = setup();
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), false);
  session.set({ access_token: "fake-test-only", email: "ana@example.com", privyDid: DID_A });
  assert.equal(session.hasSession({ email: "ana@example.com" }), false);
  assert.ok(session.get(), "an unknown caller DID must not clear the session");
});

test("hasSession rule 2: the bound Privy user reuses it, another Privy user clears it", () => {
  const { session } = setup();
  session.set({ access_token: "fake-test-only", email: "ana@example.com", privyDid: DID_A, boundAt: 1 });
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), true);
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_B }), false);
  assert.equal(session.get(), null);
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), false);
});

test("hasSession rule 3: a legacy Gold session is reused for its own e-mail and then stamped", () => {
  const { session } = setup({ now: () => 42 });
  session.set({ access_token: "fake-test-only", refresh_token: "fake-test-only", email: "ana@example.com" });
  assert.equal(session.hasSession({ email: "bia@example.com", privyDid: DID_B }), false);
  assert.ok(session.get(), "a different e-mail on a legacy session proves no other user: keep it");
  assert.equal(session.get().privyDid, undefined);
  assert.equal(session.hasSession({ email: " ANA@example.com", privyDid: DID_A }), true);
  assert.equal(session.get().privyDid, DID_A);
  assert.equal(session.get().boundAt, 42);
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_B }), false);
  assert.equal(session.get(), null);
});

test("concurrent expired sessions rotate once and retain the refreshed session (Gold)", async () => {
  const { session } = setup();
  const refreshed = jwt(inOneHour());
  let calls = 0;
  session.set({ access_token: jwt(1), refresh_token: "fake-test-only" });
  await withFetch(async (url) => { assert.match(url, /auth\/refresh$/); calls += 1; return json({ access_token: refreshed, refresh_token: "rotated-test-only" }); }, async () => {
    assert.deepEqual(await Promise.all([session.getFreshAccessToken(), session.getFreshAccessToken()]), [refreshed, refreshed]);
  });
  assert.equal(calls, 1);
  assert.equal(session.get().refresh_token, "rotated-test-only");
});

test("a token is refreshed shortly before it expires, not only after", async () => {
  const nowMs = 10_000_000;
  const { session } = setup({ now: () => nowMs, refreshSkewMs: 60_000 });
  const expiresIn30s = jwt(Math.floor(nowMs / 1000) + 30);
  session.set({ access_token: expiresIn30s, refresh_token: "fake-test-only" });
  const next = jwt(inOneHour());
  await withFetch(async () => json({ access_token: next, refresh_token: "rotated-test-only" }), async () => {
    assert.equal(await session.getFreshAccessToken(), next);
  });
  session.set({ access_token: jwt(Math.floor(nowMs / 1000) + 3600), refresh_token: "fake-test-only" });
  await withFetch(async () => { throw new Error("no refresh expected"); }, async () => {
    assert.equal(await session.getFreshAccessToken(), session.get().access_token);
  });
});

test("only a rejected refresh token ends the Vortex session (Gold fix a2bb5ec59)", async () => {
  const { session } = setup();
  let status;
  session.set({ access_token: jwt(1), refresh_token: "fake-test-only" });
  await withFetch(async () => json({ error: "unavailable" }, status), async () => {
    status = 503;
    await assert.rejects(session.getFreshAccessToken());
    assert.equal(session.get()?.refresh_token, "fake-test-only");
    status = 401;
    await assert.rejects(session.getFreshAccessToken());
    assert.equal(session.get(), null);
  });
});

test("a refresh keeps the e-mail and the Privy binding", async () => {
  const { session } = setup();
  session.set({ access_token: jwt(1), refresh_token: "fake-test-only", email: "ana@example.com", privyDid: DID_A, boundAt: 7 });
  await withFetch(async () => json({ access_token: jwt(inOneHour()), refresh_token: "rotated-test-only", email: "other@example.com" }), () => session.refresh());
  const stored = session.get();
  assert.equal(stored.refresh_token, "rotated-test-only");
  assert.equal(stored.email, "ana@example.com");
  assert.equal(stored.privyDid, DID_A);
  assert.equal(stored.boundAt, 7);
  assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), true);
});

test("a logout during an in-flight refresh is not undone by the refresh result", async () => {
  const { session } = setup();
  session.set({ access_token: jwt(1), refresh_token: "fake-test-only", privyDid: DID_A });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withFetch(async () => { await gate; return json({ access_token: jwt(inOneHour()), refresh_token: "rotated-test-only" }); }, async () => {
    const pending = session.refresh();
    session.clear();
    release();
    await assert.rejects(pending, { status: 401, code: "SESSION_REPLACED" });
  });
  assert.equal(session.get(), null);
});

test("a rejected in-flight refresh does not clear a session verified in the meantime", async () => {
  const { session } = setup();
  session.set({ access_token: jwt(1), refresh_token: "old-fake-test-only", privyDid: DID_A });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withFetch(async () => { await gate; return json({ error: "revoked" }, 401); }, async () => {
    const pending = session.refresh();
    session.set({ access_token: jwt(inOneHour()), refresh_token: "new-fake-test-only", privyDid: DID_B });
    release();
    await assert.rejects(pending, { status: 401 });
  });
  assert.equal(session.get()?.refresh_token, "new-fake-test-only");
});

test("a verified session is reused only for its own Privy user and e-mail, across refreshes (Gold, now DID-bound)", async () => {
  const { session } = setup();
  await withFetch(async (url) => json(/verify-otp$/.test(url) ? { access_token: jwt(1), refresh_token: "fake-test-only" } : { access_token: jwt(inOneHour()), refresh_token: "rotated-test-only" }), async () => {
    assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), false);
    await session.verifyOtp(" Ana@Example.com ", "123456", { privyDid: DID_A });
    assert.equal(session.hasSession({ email: "ana@example.com", privyDid: DID_A }), true);
    await session.getFreshAccessToken();
    assert.equal(session.get().refresh_token, "rotated-test-only");
    assert.equal(session.hasSession({ email: " ANA@example.com", privyDid: DID_A }), true);
  });
});

test("authenticated calls send the bearer and retry once after a 401 when a refresh token exists", async () => {
  const { session } = setup();
  const first = jwt(inOneHour());
  const second = jwt(inOneHour() + 60);
  const seen = [];
  session.set({ access_token: first, refresh_token: "fake-test-only" });
  await withFetch(async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    if (/auth\/refresh$/.test(url)) return json({ access_token: second, refresh_token: "rotated-test-only" });
    return seen.filter((call) => /\/v1\/brl\/getUser$/.test(call.url)).length === 1 ? json({ error: "expired" }, 401) : json({ identityStatus: "CONFIRMED" });
  }, async () => {
    assert.deepEqual(await session.authenticatedApi("/v1/brl/getUser", { method: "GET" }), { identityStatus: "CONFIRMED" });
  });
  assert.deepEqual(seen.map((call) => call.auth), [`Bearer ${first}`, undefined, `Bearer ${second}`]);
});

test("authenticated calls without a session ask for the e-mail code", async () => {
  const { session } = setup();
  await assert.rejects(session.authenticatedApi("/v1/brl/getUser"), { status: 401, code: "AUTH_REQUIRED" });
});
