import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SERVER_MESSAGES_PT, VortexError, createApi, friendlyError, resolveApiBase } from "../src/vortex/api.js";
import { json, withFetch } from "./helpers.mjs";

const apiBase = "https://api.example.test";

test("resolves the API base against the page origin unless an absolute URL is configured (Gold)", () => {
  assert.equal(resolveApiBase(undefined, "https://www.vortexfinance.co"), "https://www.vortexfinance.co/api/production");
  assert.equal(resolveApiBase("/api/staging/", "https://deploy-preview-1--vortexfi.netlify.app"), "https://deploy-preview-1--vortexfi.netlify.app/api/staging");
  assert.equal(resolveApiBase("https://api.vortexfinance.co", "https://www.vortexfinance.co"), "https://api.vortexfinance.co");
});

test("sends JSON, the bearer token and the public key only when set", async () => {
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url, init }); return json({ ok: true }); }, async () => {
    assert.deepEqual(await createApi({ apiBase })("/v1/x", { method: "POST", body: "{}" }, { token: "fake-test-only" }), { ok: true });
    await createApi({ apiBase, publicKey: "pk_test_fake-test-only" })("/v1/y");
  });
  assert.equal(seen[0].url, `${apiBase}/v1/x`);
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  assert.equal(seen[0].init.headers.Authorization, "Bearer fake-test-only");
  assert.equal("X-Public-Key" in seen[0].init.headers, false);
  assert.equal(seen[1].init.headers["X-Public-Key"], "pk_test_fake-test-only");
  assert.equal("Authorization" in seen[1].init.headers, false);
});

test("an injected fetch wins over the global one", async () => {
  let injected = 0;
  await withFetch(async () => { throw new Error("global fetch must not be used"); }, async () => {
    await createApi({ apiBase, fetchImpl: async () => { injected += 1; return json({}); } })("/v1/x");
  });
  assert.equal(injected, 1);
});

test("HTTP errors become VortexErrors with status, code and pt-BR message", async () => {
  await withFetch(async () => json({ error: "Invalid network: 'robinhood'." }, 400), async () => {
    await assert.rejects(createApi({ apiBase })("/v1/x"), (error) => {
      assert.ok(error instanceof VortexError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "HTTP_400");
      assert.equal(error.message, "Invalid network: 'robinhood'.");
      return true;
    });
  });
  await withFetch(async () => json({ code: "RATE_LIMITED" }, 503), async () => {
    await assert.rejects(createApi({ apiBase })("/v1/x"), { status: 503, code: "RATE_LIMITED", message: "A Vortex está temporariamente indisponível. Tente novamente em alguns minutos." });
  });
});

test("a slow API times out and a dead network is reported as such", async () => {
  const hang = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  await assert.rejects(createApi({ apiBase, fetchImpl: hang, timeoutMs: 5 })("/v1/x"), { code: "TIMEOUT", message: "A conexão demorou demais. Verifique sua internet e tente novamente." });
  await assert.rejects(createApi({ apiBase, fetchImpl: hang })("/v1/x", {}, { timeoutMs: 5 }), { code: "TIMEOUT" });
  await assert.rejects(createApi({ apiBase, fetchImpl: async () => { throw new TypeError("Failed to fetch"); } })("/v1/x"), { code: "NETWORK_ERROR" });
});

test("friendly errors in Brazilian Portuguese per status", () => {
  assert.equal(friendlyError(401, {}), "Sua sessão de segurança expirou. Solicite um novo código.");
  assert.equal(friendlyError(403, {}), "Esta operação ainda não está autorizada para este acesso.");
  assert.equal(friendlyError(409, {}), "Esta etapa já foi concluída. Atualizamos o status para você.");
  assert.equal(friendlyError(422, {}), "Confira os dados informados e tente novamente.");
  assert.equal(friendlyError(400, { error: { message: "Valor mínimo R$ 50" } }), "Valor mínimo R$ 50");
  assert.equal(friendlyError(502, { message: "upstream" }), "A Vortex está temporariamente indisponível. Tente novamente em alguns minutos.");
  assert.equal(friendlyError(418, null), "A Vortex não conseguiu concluir esta etapa.");
});

test("the API's fixed messages for the e-mail code and KYC steps are worded in Portuguese", () => {
  assert.equal(friendlyError(400, { error: "Invalid OTP or OTP expired" }), "Código inválido ou expirado. Confira o código ou solicite um novo.");
  assert.match(friendlyError(409, { error: "A subaccount already exists for this taxId" }), /Este CPF já está ligado a outra conta/);
  assert.equal(friendlyError(400, { details: "x", error: "Invalid request" }), "Confira os dados informados e tente novamente.");
  assert.equal(friendlyError(400, { message: "Invalid OTP or OTP expired" }), friendlyError(400, { error: { message: "Invalid OTP or OTP expired" } }));
  for (const [message, pt] of Object.entries(SERVER_MESSAGES_PT)) {
    assert.equal(friendlyError(400, { error: message }), pt, message);
    assert.doesNotMatch(pt, /\b(the|this|please|not)\b/i, message);
  }
  // What the status already words stays as it is.
  assert.equal(friendlyError(502, { error: "Invalid request" }), "A Vortex está temporariamente indisponível. Tente novamente em alguns minutos.");
  assert.equal(friendlyError(403, { error: "This customer is already approved" }), "Esta operação ainda não está autorizada para este acesso.");
});

test("every message in the table is one the backend really sends", () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
  const sources = walk(fileURLToPath(new URL("../../../apps/api/src/api", import.meta.url))).filter((path) => path.endsWith(".ts") && !/\.test\.ts$|__tests__/.test(path)).map((path) => readFileSync(path, "utf8")).join("\n");
  for (const message of Object.keys(SERVER_MESSAGES_PT)) assert.ok(sources.includes(message), `no backend source says "${message}"`);
});
