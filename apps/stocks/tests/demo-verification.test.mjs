import assert from "node:assert/strict";
import test from "node:test";
import { SHARED_KEYS } from "@vortexfi/consumer-kit";
import { DEMO_OTP_CODE, createDemoVerification } from "../src/lib/demo-verification.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { forbiddenFetch, jsonMemory, withFetch } from "./helpers.mjs";

const instant = async () => {};

test("demo: the first operation asks for the code and KYC, then both are skipped in this tab", async () => {
  const calls = [];
  await withFetch(forbiddenFetch(calls), async () => {
    const { storage, backing } = jsonMemory();
    const demo = createDemoVerification({ storage, delay: instant });
    assert.equal(demo.required, true);
    assert.equal(demo.hasSession(), false);
    assert.deepEqual(await demo.kyc.getReadiness(), { kycStatus: "not_started", canBuy: false, canSell: false });
    await demo.requestOtp("ana@exemplo.com");
    await assert.rejects(demo.verifyOtp("ana@exemplo.com", "000000"), /123456/);
    assert.equal(demo.hasSession(), false);
    await demo.verifyOtp("ana@exemplo.com", "123 456");
    assert.equal(demo.hasSession(), true);
    const uploads = await demo.kyc.getUploadUrls({});
    assert.equal(uploads.selfieUpload.livenessUrl, null, "no real liveness page in demo");
    assert.equal((await demo.kyc.poll("00000000000")).result, "APPROVED");
    assert.equal((await demo.kyc.getReadiness()).kycStatus, "approved");
    // Only the Stocks demo key: never the shared Vortex session that Gold reads.
    assert.deepEqual([...backing.memory.keys()], [STOCKS_KEYS.demoVerification]);
    assert.ok(![...backing.memory.keys()].includes(SHARED_KEYS.vortexSession));
    demo.reset();
    assert.equal(demo.hasSession(), false);
    assert.equal(DEMO_OTP_CODE, "123456");
  });
  assert.deepEqual(calls, []);
});

test("demo: the buy-quote deep link marks the code and KYC as done in this tab only", async () => {
  const { storage } = jsonMemory();
  const demo = createDemoVerification({ storage, delay: instant });
  assert.equal(demo.hasSession(), false);
  demo.markVerified();
  assert.equal(demo.hasSession(), true);
  assert.equal((await demo.kyc.getReadiness()).kycStatus, "approved");
  demo.reset();
  assert.equal(demo.hasSession(), false, "Reiniciar demonstração starts over");
});
