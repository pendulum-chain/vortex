import assert from "node:assert/strict";
import test from "node:test";
import { buildAveniaKycPayload, cleanCpf, createBrazilKyc } from "../src/kyc-brazil.js";
import { createApi } from "../src/vortex/api.js";
import { createVortexSession } from "../src/vortex/session.js";
import { inOneHour, json, jwt, memoryStorage, withFetch } from "./helpers.mjs";

function signedIn() {
  const backing = memoryStorage();
  const session = createVortexSession({ api: createApi({ apiBase: "https://api.example.test" }), storage: () => backing });
  session.set({ access_token: jwt(inOneHour()), refresh_token: "fake-test-only" });
  return { session, kyc: createBrazilKyc({ session }) };
}

test("readiness reads the signed-in user's own Avenia account with the OTP session (Gold fix ccd62f4d9)", async () => {
  const { kyc } = signedIn();
  const seen = [];
  let reply;
  await withFetch(async (url, init) => { seen.push({ url, init }); return json(reply.body, reply.status); }, async () => {
    reply = { status: 200, body: { identityStatus: "CONFIRMED", kycLevel: 1, subAccountId: "s1" } };
    assert.deepEqual(await kyc.getReadiness(), { kycStatus: "approved", canBuy: true, canSell: true });
    assert.match(seen[0].url, /\/v1\/brl\/getUser$/);
    assert.match(seen[0].init.headers.Authorization, /^Bearer /);
    reply = { status: 200, body: { identityStatus: "PENDING", subAccountId: "s1" } };
    assert.deepEqual(await kyc.getReadiness(), { kycStatus: "pending", canBuy: false, canSell: false });
    reply = { status: 400, body: { error: "No completed provider profile found for this API key user." } };
    assert.deepEqual(await kyc.getReadiness(), { kycStatus: "not_started", canBuy: false, canSell: false });
    reply = { status: 404, body: {} };
    assert.equal((await kyc.getReadiness()).kycStatus, "not_started");
    reply = { status: 500, body: { error: "unavailable" } };
    await assert.rejects(kyc.getReadiness(), { status: 500 });
  });
});

test("the Avenia payload uses alpha-3 country codes and cleans CPF and CEP (Gold fix 31e9c02c3)", () => {
  const payload = buildAveniaKycPayload({
    form: { fullName: "  Ana Silva ", dateOfBirth: "1990-01-31", taxId: "123.456.789-09", state: "sp", city: " São Paulo ", zipCode: "01310-100", streetAddress: " Av. Paulista, 1000 " },
    uploads: { selfieUpload: { id: "selfie-fake" }, idUpload: { id: "doc-fake" } },
    subAccountId: "sub-fake",
    email: "ana@example.com",
  });
  assert.deepEqual(payload, {
    subAccountId: "sub-fake",
    fullName: "Ana Silva",
    dateOfBirth: "1990-01-31",
    countryOfTaxId: "BRA",
    taxIdNumber: "12345678909",
    email: "ana@example.com",
    country: "BRA",
    state: "SP",
    city: "São Paulo",
    zipCode: "01310100",
    streetAddress: "Av. Paulista, 1000",
    uploadedSelfieId: "selfie-fake",
    uploadedDocumentId: "doc-fake",
  });
  assert.equal(cleanCpf("123.456.789-0999"), "12345678909");
  assert.equal(cleanCpf(null), "");
});

test("KYC calls hit the Gold endpoints with the OTP bearer", async () => {
  const { kyc } = signedIn();
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url, method: init.method, body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body, auth: init.headers.Authorization }); return json({ ok: true }); }, async () => {
    await kyc.createSubaccount({ name: "Ana Silva", taxId: "12345678909", quoteId: "q1", sessionId: "s1" });
    await kyc.getUploadUrls({ taxId: "12345678909", documentType: "ID", isDoubleSided: true });
    await kyc.submit({ subAccountId: "sub" });
    await kyc.getStatus("123 456");
  });
  assert.deepEqual(seen.map((call) => [call.method, call.url.replace("https://api.example.test", "")]), [
    ["POST", "/v1/brl/createSubaccount"],
    ["POST", "/v1/brl/getUploadUrls"],
    ["POST", "/v1/brl/newKyc"],
    ["GET", "/v1/brl/getKycStatus?taxId=123%20456"],
  ]);
  assert.deepEqual(seen[0].body, { accountType: "INDIVIDUAL", name: "Ana Silva", taxId: "12345678909", quoteId: "q1", sessionId: "s1" });
  assert.ok(seen.every((call) => /^Bearer /.test(call.auth)));
});

test("document upload goes to the presigned URL without the Vortex bearer", async () => {
  const { kyc } = signedIn();
  const seen = [];
  const file = new Blob(["fake-test-only"], { type: "image/jpeg" });
  await withFetch(async (url, init) => { seen.push({ url, init }); return new Response(null, { status: seen.length === 1 ? 200 : 403 }); }, async () => {
    await kyc.uploadDocument("https://uploads.example.test/presigned", file);
    await assert.rejects(kyc.uploadDocument("https://uploads.example.test/presigned", file), { code: "DOCUMENT_UPLOAD_FAILED", status: 403 });
  });
  assert.equal(seen[0].init.method, "PUT");
  assert.deepEqual(seen[0].init.headers, { "Content-Type": "image/jpeg" });
});

test("polling stops on a final provider result", async () => {
  const { kyc } = signedIn();
  const replies = [{ status: "PENDING" }, { status: "PROCESSING", result: "APPROVED" }];
  const updates = [];
  await withFetch(async () => json(replies.shift()), async () => {
    const result = await kyc.poll("12345678909", { intervalMs: 1, onUpdate: (update) => updates.push(update) });
    assert.equal(result.result, "APPROVED");
  });
  assert.equal(updates.length, 2);
  await withFetch(async () => json({ status: "COMPLETED", result: "REJECTED" }), async () => {
    assert.equal((await kyc.poll("12345678909", { intervalMs: 1 })).result, "REJECTED");
  });
});

test("polling aborts during the sleep instead of polling on in the background", async () => {
  const { kyc } = signedIn();
  const controller = new AbortController();
  let calls = 0;
  await withFetch(async () => { calls += 1; setTimeout(() => controller.abort(), 5); return json({ status: "PENDING" }); }, async () => {
    const startedAt = Date.now();
    await assert.rejects(kyc.poll("12345678909", { intervalMs: 60_000, signal: controller.signal }), { name: "AbortError" });
    assert.ok(Date.now() - startedAt < 5_000, "the abort must not wait for the interval");
  });
  assert.equal(calls, 1);
});

test("polling gives up with a pending error after the timeout", async () => {
  const { kyc } = signedIn();
  await withFetch(async () => json({ status: "PENDING" }), async () => {
    await assert.rejects(kyc.poll("12345678909", { intervalMs: 1, timeoutMs: 10 }), { code: "KYC_PENDING" });
  });
});
