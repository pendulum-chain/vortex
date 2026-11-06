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

// Answers by path, the way the two reads behind readiness reach the API.
const replies = (routes) => async (url) => {
  const reply = routes[new URL(url).pathname];
  return json(reply?.body ?? {}, reply?.status ?? 200);
};
const NOT_APPROVED = { status: 400, body: { error: "No completed provider profile found for this API key user." } };
const onboarding = (...accounts) => ({ status: 200, body: { entities: [{ id: "e1", accounts }] } });
const avenia = (kycCase, overrides = {}) => ({ provider: "avenia", customerType: "individual", kycCase, ...overrides });
const notStarted = { kycStatus: "not_started", canBuy: false, canSell: false };
const pending = { kycStatus: "pending", canBuy: false, canSell: false };

test("readiness reads the signed-in user's own account with the OTP session, refreshing the provider's attempt first", async () => {
  const { kyc } = signedIn();
  const seen = [];
  const answer = replies({ "/v1/onboarding/status": onboarding(), "/v1/brl/getUser": { status: 200, body: { identityStatus: "CONFIRMED", kycLevel: 1, subAccountId: "s1" } } });
  await withFetch(async (url, init) => { seen.push({ url, init }); return answer(url); }, async () => {
    assert.deepEqual(await kyc.getReadiness(), { kycStatus: "approved", canBuy: true, canSell: true });
  });
  assert.deepEqual(seen.map(({ url }) => new URL(url).pathname), ["/v1/onboarding/status", "/v1/brl/getUser"], "the refresh is what lets getUser pass after a review ended");
  assert.ok(seen.every(({ init }) => /^Bearer /.test(init.headers.Authorization)));
});

test("readiness for every state a returning user can be in", async () => {
  const cases = [
    ["no account yet", onboarding(), NOT_APPROVED, notStarted],
    ["no entities yet", { status: 200, body: { entities: [] } }, NOT_APPROVED, notStarted],
    ["a 404 from getUser", onboarding(), { status: 404, body: {} }, notStarted],
    // Creating the subaccount alone sets in_review and submittedAt, before any document is sent.
    ["a subaccount with nothing submitted", onboarding(avenia({ status: "in_review", statusExternal: null, submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, notStarted],
    ["a submission with no attempt confirmed", onboarding(avenia({ status: "pending", statusExternal: null, submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, notStarted],
    ["an attempt just sent", onboarding(avenia({ status: "pending", statusExternal: "PENDING", submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, pending],
    ["an attempt in review", onboarding(avenia({ status: "in_review", statusExternal: "PROCESSING", submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, pending],
    ["an expired attempt", onboarding(avenia({ status: "pending", statusExternal: "EXPIRED", submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, notStarted],
    ["a rejected attempt", onboarding(avenia({ status: "rejected", statusExternal: "COMPLETED", submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, notStarted],
    ["a rejected case with a stale attempt status", onboarding(avenia({ status: "rejected", statusExternal: "PROCESSING", submittedAt: "2026-11-01T10:00:00Z" })), NOT_APPROVED, notStarted],
    ["a business account in review", onboarding(avenia({ status: "in_review", statusExternal: "PROCESSING" }, { customerType: "business" })), NOT_APPROVED, notStarted],
    ["another provider's review", onboarding(avenia({ status: "in_review", statusExternal: "PROCESSING" }, { provider: "monerium" })), NOT_APPROVED, notStarted],
    ["an account with no case", onboarding(avenia(null)), NOT_APPROVED, notStarted],
    ["an approved account the provider has not confirmed", onboarding(), { status: 200, body: { identityStatus: "PENDING", subAccountId: "s1" } }, pending],
    ["approved, with the refresh down", { status: 500, body: { error: "unavailable" } }, { status: 200, body: { identityStatus: "CONFIRMED" } }, { kycStatus: "approved", canBuy: true, canSell: true }],
  ];
  for (const [label, status, user, expected] of cases) {
    const { kyc } = signedIn();
    await withFetch(replies({ "/v1/onboarding/status": status, "/v1/brl/getUser": user }), async () => {
      assert.deepEqual(await kyc.getReadiness(), expected, label);
    });
  }
});

test("readiness never reports \"not started\" when it cannot know", async () => {
  const down = { status: 500, body: { error: "unavailable" } };
  const check = async (status, user, expected) => {
    const { kyc } = signedIn();
    await withFetch(replies({ "/v1/onboarding/status": status, "/v1/brl/getUser": user, "/v1/auth/refresh": { status: 401, body: {} } }), () => assert.rejects(kyc.getReadiness(), expected));
  };
  await check(down, NOT_APPROVED, { status: 500 });
  await check(onboarding(), down, { status: 500 });
  await check({ status: 401, body: {} }, NOT_APPROVED, { status: 401 });
  await check(onboarding(), { status: 401, body: {} }, { status: 401 });
});

test("a refused submission is told apart: the form can fix it, and resending the same payload cannot", async () => {
  const { kyc } = signedIn();
  await withFetch(replies({ "/v1/brl/newKyc": { status: 409, body: { error: "The KYC submission does not match this request" } } }), () =>
    assert.rejects(kyc.submit({ subAccountId: "sub" }), { code: "KYC_NEW_ATTEMPT_BLOCKED", status: 409, message: "Não foi possível abrir uma nova verificação automaticamente. Consulte o suporte da Vortex." }));
  await withFetch(replies({ "/v1/brl/newKyc": { status: 400, body: { error: "The provider rejected the KYC submission. Correct the submitted details and try again." } } }), () =>
    assert.rejects(kyc.submit({ subAccountId: "sub" }), { code: "KYC_SUBMISSION_REFUSED", status: 400, message: "A Avenia recusou os dados enviados. Corrija as informações e tente novamente." }));
  // The server keeps the same submission through these: only the same payload resolves them.
  await withFetch(replies({ "/v1/brl/newKyc": { status: 502, body: { error: "The KYC submission outcome requires reconciliation" } } }), () =>
    assert.rejects(kyc.submit({ subAccountId: "sub" }), (error) => error.status === 502 && error.code !== "KYC_SUBMISSION_REFUSED"));
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
