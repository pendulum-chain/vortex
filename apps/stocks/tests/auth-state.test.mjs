import assert from "node:assert/strict";
import test from "node:test";
import { pendingAuth } from "../src/auth-state.js";

test("Privy initialization failure releases pending login, with or without a stored-session hint", async () => {
  for (const returning of [false, true]) {
    let calls = 0;
    const auth = pendingAuth({ returning, queued: "google", queue: () => calls++, error: "AUTH_INITIALIZATION_FAILED" });
    assert.equal(auth.status, "error"); assert.equal(auth.queued, null); assert.equal(auth.returning, false);
    await auth.login("google"); assert.equal(calls, 0); assert.equal(auth.authenticated, false);
  }
});
test("a sign-in click during healthy loading is still queued", async () => {
  const calls = [], auth = pendingAuth({ returning: true, queued: null, queue: method => calls.push(method) });
  await auth.login("email"); assert.deepEqual(calls, ["email"]); assert.equal(auth.status, "loading");
});
