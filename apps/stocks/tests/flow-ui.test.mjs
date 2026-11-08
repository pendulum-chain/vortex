import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { transformWithEsbuild } from "vite";
import { usePendingRampRead } from "../src/hooks.js";
import { readConfig } from "../src/lib/config.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { STOCKS_KEYS, createRampStores } from "../src/lib/stores.js";
import { WALLET, sourceFiles, withFetch } from "./helpers.mjs";

// The DOM comes before react-dom: it decides at load time how it listens for input events, and the
// fallback it picks without a DOM does not work in jsdom.
const dom = new JSDOM("<!doctype html>", { url: "http://localhost/pt-br/stocks/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.scrollTo = () => {};
const { createRoot } = await import("react-dom/client");

// The real flows, through the app's own Vite transformer: a .jsx file and the .jsx files it imports
// (lazily too) become data: modules, with every other import resolved from the importing file.
const loaded = new Map();
async function jsxModuleUrl(url) {
  if (!loaded.has(url.href)) {
    loaded.set(url.href, (async () => {
      const { code } = await transformWithEsbuild(await readFile(url, "utf8"), fileURLToPath(url), { jsx: "automatic", define: { "import.meta.env.BASE_URL": JSON.stringify("/") } });
      let rewritten = code;
      for (const [statement, keyword, specifier] of [...code.matchAll(/(from\s+|import\()["']([^"']+)["']/g)]) {
        const target = specifier.endsWith(".jsx") ? await jsxModuleUrl(new URL(specifier, url)) : specifier.startsWith(".") ? new URL(specifier, url).href : import.meta.resolve(specifier);
        rewritten = rewritten.replace(statement, `${keyword}${JSON.stringify(target)}`);
      }
      return `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
    })());
  }
  return loaded.get(url.href);
}
const flow = async (path) => import(await jsxModuleUrl(new URL(path, import.meta.url)));
const { default: BuyFlow } = await flow("../src/flows/BuyFlow.jsx");
const { default: SellFlow } = await flow("../src/flows/SellFlow.jsx");
const { KycStep, POLL_RESTART_MS } = await flow("../src/flows/parts.jsx");
const { ActivityRow } = await flow("../src/components/ActivityRow.jsx");
const { App } = await flow("../src/App.jsx");

const NVDA = STOCK_TOKENS.find((token) => token.symbol === "NVDA");
const IN_REVIEW = /Sua verificação ainda está em análise/;
const KYC_FORM = /Verifique sua identidade/;

const realSetTimeout = globalThis.setTimeout;

async function harness(run) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root"));
  const label = (node) => node.textContent.replace(/\s+/g, " ").trim();
  const click = async (name) => {
    const button = [...document.querySelectorAll("button")].find((item) => label(item) === name);
    assert.ok(button, `button ${name}`);
    await act(async () => button.click());
  };
  const type = (selector, value) => act(async () => {
    const input = document.querySelector(selector);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const check = () => act(async () => document.querySelector(".check input").click());
  const heading = () => document.querySelector(".result h3")?.textContent;
  const has = (name) => [...document.querySelectorAll("button")].some((item) => label(item) === name);
  const wait = () => act(async () => { await new Promise((resolve) => realSetTimeout(resolve, 5)); });
  try { await run({ render: (element) => act(async () => root.render(element)), click, type, check, heading, has, wait, text: () => document.body.textContent }); }
  finally { await act(async () => root.unmount()); }
}

const notReady = (kycStatus) => ({ kycStatus, canBuy: false, canSell: false });
const quote = { id: "quote-fake-test-only", brlAmount: 500, tokenAmount: "0.5", tokenAmountWei: "500000000000000000", fees: { network: 1, service: 2, total: 3, currency: "BRL" }, impliedBrlPerToken: 994, expiresAt: Date.now() + 60_000, rawQuote: {} };
const open = { NVDA: { buy: true, sell: true, reason: null } };
function fixtures(readiness) {
  const runtime = {
    adapter: { getAvailability: async () => open, quoteBuy: async () => quote, quoteSell: async () => quote },
    verification: { required: false, demoCode: null, hasSession: () => true },
    kyc: { demo: true },
    activeRampStore: { get: () => null },
    getReadiness: async () => readiness,
    withIssuerPauses: (map) => map,
    readHoldings: async () => ({ positions: [{ symbol: "NVDA", raw: 10n ** 18n }], ethWei: 10n ** 18n }),
    readGasPrice: async () => 20_000_000n,
    tokenFlags: () => ({ NVDA: { paused: false } }),
    walletSeam: async () => ({ provider: {} }),
    simulated: false,
  };
  const market = { state: { status: "ok", prices: { NVDA: { brl: 1000 } } }, model: { referencePrice: () => null } };
  return { token: NVDA, auth: { address: WALLET, user: { email: "fake-test-only@example.com", privyDid: "did:privy:fake" } }, runtime, market, flags: {}, onClose: () => {} };
}

test("a buy with a KYC in review says so and opens no blank form", () => harness(async (s) => {
  await s.render(createElement(BuyFlow, fixtures(notReady("pending"))));
  await s.click("Continuar");
  assert.match(s.text(), IN_REVIEW);
  assert.doesNotMatch(s.text(), KYC_FORM);
}));

test("a buy with no KYC started opens the form", () => harness(async (s) => {
  await s.render(createElement(BuyFlow, fixtures(notReady("not_started"))));
  await s.click("Continuar");
  assert.match(s.text(), KYC_FORM);
  assert.doesNotMatch(s.text(), IN_REVIEW);
}));

const sellAmount = async (s) => {
  await s.type("#sell-amount", "0,5");
  await s.type('input[placeholder^="CPF"]', "fake-test-only@example.com");
  await s.click("Continuar");
};

test("a sell with a KYC in review says so and opens no blank form", () => harness(async (s) => {
  await s.render(createElement(SellFlow, { ...fixtures(notReady("pending")), holdingRaw: 10n ** 18n }));
  await sellAmount(s);
  assert.match(s.text(), IN_REVIEW);
  assert.doesNotMatch(s.text(), KYC_FORM);
}));

test("a sell with no KYC started opens the form", () => harness(async (s) => {
  await s.render(createElement(SellFlow, { ...fixtures(notReady("not_started")), holdingRaw: 10n ** 18n }));
  await sellAmount(s);
  assert.match(s.text(), KYC_FORM);
}));

// kyc.demo fills the form, so these reach the submit with no files and no Avenia window.
function kycWith(submit) {
  const calls = { uploads: 0, submit: 0, poll: 0 };
  return {
    calls,
    kyc: {
      demo: true,
      createSubaccount: async () => ({ subAccountId: "sub-fake" }),
      getUploadUrls: async () => { calls.uploads += 1; return { idUpload: { id: "doc-fake" }, selfieUpload: { id: "selfie-fake", livenessUrl: null } }; },
      uploadDocument: async () => {},
      submit: async () => { calls.submit += 1; return submit(); },
      poll: async () => { calls.poll += 1; return { status: "PROCESSING" }; },
    },
  };
}
const refusedWith = (code, status) => () => { throw Object.assign(new Error("Mensagem do kit."), { code, status }); };

for (const code of ["KYC_NEW_ATTEMPT_BLOCKED", "KYC_SUBMISSION_REFUSED"]) {
  test(`${code}: back to the form with the reason, so nothing refused is resubmitted`, () => harness(async (s) => {
    const { kyc, calls } = kycWith(refusedWith(code, 409));
    await s.render(createElement(KycStep, { kyc, quote: null, email: "fake-test-only@example.com", onApproved: () => {} }));
    await s.click("Continuar para a selfie");
    await s.click("Simular selfie concluída");
    assert.equal(calls.submit, 1);
    assert.match(s.text(), KYC_FORM);
    assert.match(s.text(), /Mensagem do kit\./);
    // A new attempt starts from a new upload.
    await s.click("Continuar para a selfie");
    assert.equal(calls.uploads, 2);
    assert.doesNotMatch(s.text(), /Mensagem do kit\./);
  }));
}

test("any other failure of the submit stays on the selfie step, where a retry sends the same payload", () => harness(async (s) => {
  const { kyc, calls } = kycWith(refusedWith("HTTP_502", 502));
  await s.render(createElement(KycStep, { kyc, quote: null, email: "fake-test-only@example.com", onApproved: () => {} }));
  await s.click("Continuar para a selfie");
  await s.click("Simular selfie concluída");
  assert.match(s.text(), /Faça a selfie segura/);
  assert.match(s.text(), /Mensagem do kit\./);
  await s.click("Simular selfie concluída");
  assert.equal(calls.submit, 2);
  assert.equal(calls.uploads, 1);
}));

// A flow resumed on a registered operation. The adapter answers from `ramp`; `calls` logs what the flow asks.
const approved = { kycStatus: "approved", canBuy: true, canSell: true };
const pendingPoll = () => new Promise(() => {});
function resumed({ ramp, stage = "registered", adapter = {}, verification }) {
  const calls = { abandon: [], poll: 0 };
  const props = fixtures(approved);
  props.runtime.adapter = {
    ...props.runtime.adapter,
    enabled: true,
    getMaintenanceStatus: async () => ({ active: false, details: null }),
    getRamp: async () => ramp,
    abandonRamp: async (id, options) => { calls.abandon.push([id, options.walletAddress]); return ramp; },
    pollStatus: () => { calls.poll += 1; return pendingPoll(); },
    ...adapter,
  };
  if (verification) props.runtime.verification = verification;
  return { calls, props: { ...props, resume: { rampId: ramp?.id ?? "ramp-1", stage } } };
}
const initial = (overrides = {}) => ({ id: "ramp-1", currentPhase: "initial", classification: "awaiting_payment", brlAmount: "500", tokenAmount: "0.5", depositQrCode: "pix-code-fake-test-only", startDeadline: Date.now() + 600_000, ...overrides });

test("an expired Pix says a paid one continues, and offers a way out that goes back to the amount", () => harness(async (s) => {
  const { calls, props } = resumed({ ramp: initial({ startDeadline: Date.now() - 1_000 }) });
  await s.render(createElement(BuyFlow, props));
  assert.match(s.text(), /Pix expirado/);
  assert.match(s.text(), /Se já pagou, a compra continua e aparece no Histórico/);
  await s.click("Não paguei, começar de novo");
  assert.deepEqual(calls.abandon, [["ramp-1", WALLET]]);
  assert.match(s.text(), /Quanto deseja investir/);
  assert.doesNotMatch(s.text(), /Código da operação/, "a new purchase, with no trace of the old code on screen");
}));

test("a Pix code still valid offers no way out", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial() });
  await s.render(createElement(BuyFlow, props));
  await s.wait();
  assert.equal(s.has("Não paguei, começar de novo"), false);
}));

test("\"Não paguei\" on a ramp the worker has started goes on tracking it", () => harness(async (s) => {
  const started = initial({ currentPhase: "brlaOnrampMint", classification: "processing", depositQrCode: null });
  let reads = 0;
  const { calls, props } = resumed({ ramp: initial({ startDeadline: Date.now() - 1_000 }), adapter: { abandonRamp: async () => started, getRamp: async () => (++reads === 1 ? initial({ startDeadline: Date.now() - 1_000 }) : started) } });
  await s.render(createElement(BuyFlow, props));
  await s.click("Não paguei, começar de novo");
  assert.equal(s.heading(), "Confirmando seu Pix");
  assert.equal(calls.poll, 1);
}));

test("a registration that never finished is released: no Pix code was shown, and a new purchase can start", () => harness(async (s) => {
  const { calls, props } = resumed({ ramp: initial(), stage: "registering" });
  await s.render(createElement(BuyFlow, props));
  assert.deepEqual(calls.abandon, [["ramp-1", WALLET]]);
  assert.match(s.text(), /O registro desta compra não foi concluído, e nenhum Pix foi gerado/);
  assert.match(s.text(), /Código da operação: ramp-1/);
  await s.click("Tentar novamente");
  assert.match(s.text(), /Quanto deseja investir/);
}));

test("a registered Pix the status shows no code for is not released: it may have been paid", () => harness(async (s) => {
  const { calls, props } = resumed({ ramp: initial({ depositQrCode: null }) });
  await s.render(createElement(BuyFlow, props));
  assert.deepEqual(calls.abandon, []);
  assert.match(s.text(), /O registro precisa ser conferido pela Vortex/);
}));

test("a sell whose registration never finished is released, with no retry", () => harness(async (s) => {
  const { calls, props } = resumed({ ramp: initial({ depositQrCode: null }), stage: "registering" });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  assert.deepEqual(calls.abandon, [["ramp-1", WALLET]]);
  assert.match(s.text(), /O registro desta venda não foi concluído, e nada saiu da sua carteira/);
  assert.equal(s.has("Tentar novamente"), false);
}));

test("a sell at that stage that the server shows as started is not released", () => harness(async (s) => {
  const { calls, props } = resumed({ ramp: initial({ currentPhase: "uniswapSwap", classification: "processing", depositQrCode: null }), stage: "registering" });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  assert.deepEqual(calls.abandon, []);
  assert.match(s.text(), /O registro precisa ser conferido pela Vortex/);
}));

test("a failed buy tells a payer what to do", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial({ classification: "failure", depositQrCode: null }) });
  await s.render(createElement(BuyFlow, props));
  assert.match(s.text(), /Se houve débito, consulte o suporte com o código da operação/);
  assert.match(s.text(), /Código da operação: ramp-1/);
}));

test("a buy that failed after its Pix keeps its code and offers no new purchase", () => harness(async (s) => {
  const props = fixtures(approved);
  Object.assign(props.runtime.adapter, {
    enabled: true, getMaintenanceStatus: async () => ({ active: false, details: null }), registerBuy: async () => initial(),
    startRamp: async () => initial({ currentPhase: "brlaOnrampMint", classification: "processing", depositQrCode: null }),
    pollStatus: async () => initial({ currentPhase: "nablaSwap", classification: "failure", depositQrCode: null }),
  });
  await s.render(createElement(BuyFlow, props));
  await s.click("Continuar");
  await s.check();
  await s.click("Gerar Pix de R$ 500,00");
  await s.wait();
  await s.click("Já fiz o Pix");
  await s.wait();
  assert.match(s.text(), /Se houve débito, consulte o suporte com o código da operação/);
  assert.match(s.text(), /Código da operação: ramp-1/);
  assert.equal(s.has("Tentar novamente"), false);
}));

for (const [name, Flow] of [["buy", BuyFlow], ["sell", SellFlow]]) {
  test(`a ${name} that cannot be read still shows the code its message asks for`, () => harness(async (s) => {
    const { props } = resumed({ ramp: initial(), adapter: { getRamp: async () => { throw Object.assign(new Error("Esta operação não foi encontrada. Consulte o suporte com o código da operação."), { status: 404 }); } } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    assert.match(s.text(), /não foi encontrada/);
    assert.match(s.text(), /Código da operação: ramp-1/);
  }));

  test(`a ${name} whose status read fails again on retry shows the reason, not an endless wait`, () => harness(async (s) => {
    let reads = 0;
    const { props } = resumed({ ramp: initial(), adapter: { getRamp: async () => { reads += 1; throw Object.assign(new Error("Não foi possível conectar à Vortex."), { status: 0 }); } } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    await s.click("Tentar novamente");
    assert.equal(reads, 2);
    assert.match(s.text(), /Não foi possível conectar à Vortex/);
    assert.ok(s.has("Tentar novamente"));
    assert.equal(document.querySelector(".spinner"), null);
  }));
}

test("a refused registration shows its code, though it no longer holds the wallet", () => harness(async (s) => {
  const props = fixtures(approved);
  props.runtime.adapter.registerBuy = async () => { throw Object.assign(new Error("Esta compra não confere com a cotação."), { code: "WRONG_ROUTE", details: { rampId: "ramp-refused" } }); };
  await s.render(createElement(BuyFlow, props));
  await s.click("Continuar");
  await s.check();
  await s.click("Gerar Pix de R$ 500,00");
  assert.match(s.text(), /Código da operação: ramp-refused/);
  assert.match(s.text(), /Não foi possível continuar/);
}));

// Each pollStatus answers from `answers`, then never settles; the restart delay is skipped.
const restarting = async (run) => {
  globalThis.setTimeout = (callback, ms, ...rest) => realSetTimeout(callback, ms === POLL_RESTART_MS ? 0 : ms, ...rest);
  try { await run(); } finally { globalThis.setTimeout = realSetTimeout; }
};
const polling = (answers) => () => { const next = answers.shift(); return next ? next() : pendingPoll(); };
const processingAt = (currentPhase) => initial({ currentPhase, classification: "processing", depositQrCode: null });
const REFUSED = () => Promise.reject(Object.assign(new Error("Esta operação pertence a outra conta."), { status: 403 }));
const verifying = { required: true, demoCode: null, hasSession: () => true, requestOtp: async () => {}, verifyOtp: async () => {} };

for (const [name, Flow, phase] of [["buy", BuyFlow, "nablaSwap"], ["sell", SellFlow, "uniswapSwap"]]) {
  test(`a ${name} keeps tracking through the poll's time limit and through network loss`, () => restarting(() => harness(async (s) => {
    const seen = [];
    const answers = [
      () => Promise.reject(Object.assign(new Error("A operação continua em processamento."), { code: "POLL_TIMEOUT" })),
      () => Promise.reject(Object.assign(new Error("Não foi possível conectar à Vortex."), { code: "SERVER_ERROR", status: 0 })),
      () => Promise.reject(Object.assign(new Error("Vortex indisponível."), { code: "SERVER_ERROR", status: 503 })),
      () => Promise.resolve({ ...processingAt("complete"), classification: "success" }),
    ];
    const next = polling(answers);
    const { props } = resumed({ ramp: processingAt(phase), adapter: { pollStatus: (...args) => { seen.push(args[0]); return next(); } } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    for (let round = 0; round < 8 && answers.length; round += 1) { assert.doesNotMatch(s.text(), /Não foi possível continuar/); await s.wait(); }
    await s.wait();
    assert.equal(seen.length, 4);
    assert.match(s.text(), name === "buy" ? /Compra concluída/ : /Venda concluída/);
  })));

  test(`a ${name} refused while tracking stops on the issue screen, with no new read`, () => restarting(() => harness(async (s) => {
    let polls = 0;
    const { props } = resumed({ ramp: processingAt(phase), adapter: { pollStatus: () => { polls += 1; return REFUSED(); } } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    await s.wait();
    assert.match(s.text(), /Esta operação pertence a outra conta/);
    assert.equal(polls, 1);
  })));

  test(`closing a ${name} while tracking cancels the restart`, () => harness(async (s) => {
    const restarts = new Set();
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = (callback, ms, ...rest) => { if (ms !== POLL_RESTART_MS) return realSetTimeout(callback, ms, ...rest); restarts.add(callback); return callback; };
    globalThis.clearTimeout = (id) => { if (!restarts.delete(id)) realClearTimeout(id); };
    try {
      const { props } = resumed({ ramp: processingAt(phase), adapter: { pollStatus: () => Promise.reject(Object.assign(new Error("Sem conexão."), { status: 0 })) } });
      await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
      await s.wait();
      assert.equal(restarts.size, 1);
      await s.render(null);
      assert.equal(restarts.size, 0);
    } finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
  }));

  test(`a ${name} whose session ended while tracking asks for the code and goes back to tracking`, () => restarting(() => harness(async (s) => {
    let polls = 0;
    const { props } = resumed({ ramp: processingAt(phase), verification: verifying, adapter: { pollStatus: () => { polls += 1; return polls === 1 ? Promise.reject(Object.assign(new Error("Confirme seu e-mail com o código antes de continuar."), { code: "AUTH_REQUIRED", status: 401 })) : pendingPoll(); } } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    await s.wait();
    assert.match(s.text(), /Confirme seu e-mail/);
    await s.click("Enviar código por e-mail");
    await s.type(".otp-input", "123456");
    await s.click("Confirmar código");
    await s.wait();
    assert.ok(s.heading(), "the waiting screen, not the wallet step");
    assert.doesNotMatch(s.text(), /Confirme na sua carteira/);
    assert.equal(polls, 2);
  })));
}

for (const [name, Flow] of [["buy", BuyFlow], ["sell", SellFlow]]) {
  test(`a ${name} that fails after a good code leaves the code step, so the used code is not sent again`, () => harness(async (s) => {
    let verified = 0;
    const props = fixtures(approved);
    props.runtime.verification = { ...verifying, hasSession: () => false, verifyOtp: async () => { verified += 1; } };
    props.runtime.adapter.getAvailability = async () => ({ NVDA: { buy: false, sell: false, reason: "paused" } });
    await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
    if (name === "sell") await sellAmount(s); else await s.click("Continuar");
    await s.click("Enviar código por e-mail");
    await s.type(".otp-input", "123456");
    await s.click("Confirmar código");
    assert.equal(verified, 1);
    assert.match(s.text(), /Negociação pausada pelo emissor/);
    assert.equal(s.has("Confirmar código"), false);
  }));
}

test("a sell that still needs its permit goes back to the wallet step after the code", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial({ depositQrCode: null }), stage: "signing", verification: verifying, adapter: { resumeSell: async () => { throw Object.assign(new Error("Confirme seu e-mail com o código antes de continuar."), { code: "AUTH_REQUIRED", status: 401 }); } } });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  await s.click("Continuar esta venda");
  await s.click("Enviar código por e-mail");
  await s.type(".otp-input", "123456");
  await s.click("Confirmar código");
  assert.match(s.text(), /Confirme na sua carteira/);
}));

test("a sell held by maintenance is not told about a Pix payment", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial({ depositQrCode: null }), stage: "ready", adapter: { resumeSell: async () => { throw Object.assign(new Error("A Vortex está em manutenção. Aguarde para continuar; não faça um novo Pix agora."), { code: "MAINTENANCE_ACTIVE" }); } } });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  await s.click("Continuar esta venda");
  assert.match(s.text(), /Aguarde para continuar esta venda/);
  assert.doesNotMatch(s.text(), /Pix agora/);
}));

const headingAt = async (s, Flow, phase) => {
  const { props } = resumed({ ramp: processingAt(phase) });
  await s.render(createElement(Flow, { ...props, holdingRaw: 10n ** 18n }));
  return s.heading();
};

test("the buy's waiting screen claims only what its phase shows", () => harness(async (s) => {
  assert.equal(await headingAt(s, BuyFlow, "brlaOnrampMint"), "Confirmando seu Pix");
}));
test("a compliance hold is named", () => harness(async (s) => {
  assert.equal(await headingAt(s, BuyFlow, "onHoldForComplianceCheck"), "Confirmando seu Pix");
  assert.match(s.text(), /verificação de conformidade/);
}));
test("the buy's tokens are on the way once the Pix is confirmed", () => harness(async (s) => {
  assert.equal(await headingAt(s, BuyFlow, "nablaSwap"), "Seus tokens NVDA estão a caminho");
}));
test("the sell's waiting screen says it is selling until the payout", () => harness(async (s) => {
  assert.equal(await headingAt(s, SellFlow, "uniswapSwap"), "Vendendo seus tokens");
}));
test("a ramp held for days no longer says it is on the way", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial({ currentPhase: "relayBridge", classification: "processing", depositQrCode: null, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString() }) });
  await s.render(createElement(BuyFlow, props));
  assert.equal(s.heading(), "Esta operação está demorando mais que o normal");
  assert.doesNotMatch(s.text(), /a caminho|a compra continua/);
  assert.match(s.text(), /Código da operação: ramp-1/);
}));
test("the sell's Pix is on the way from the payout on", () => harness(async (s) => {
  assert.equal(await headingAt(s, SellFlow, "brlaPayoutOnBase"), "Seu Pix está a caminho");
}));

test("the buy review promises the exact amount", () => harness(async (s) => {
  await s.render(createElement(BuyFlow, fixtures(approved)));
  await s.click("Continuar");
  assert.match(s.text(), /Você recebe\s*0,5\d* NVDA \(token\)/);
  assert.doesNotMatch(s.text(), /Você recebe\s*≈/);
  assert.doesNotMatch(s.text(), /pode variar/);
}));

test("the Pix screen names the exact amount", () => harness(async (s) => {
  const props = fixtures(approved);
  Object.assign(props.runtime.adapter, { enabled: true, getMaintenanceStatus: async () => ({ active: false, details: null }), registerBuy: async () => initial() });
  await s.render(createElement(BuyFlow, props));
  await s.click("Continuar");
  await s.check();
  await s.click("Gerar Pix de R$ 500,00");
  await s.wait();
  assert.match(s.text(), /convertido em 0,5\d* NVDA \(token\)/);
  assert.doesNotMatch(s.text(), /convertido em ≈/);
}));

test("a sell asks the wallet for one confirmation", () => harness(async (s) => {
  const { props } = resumed({ ramp: initial({ depositQrCode: null }), stage: "signing" });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  assert.match(s.text(), /Uma confirmação, para autorizar esta venda/);
  assert.doesNotMatch(s.text(), /duas confirmações/);
}));

test("the KYC form says the data passes through Vortex", () => harness(async (s) => {
  const { kyc } = kycWith(() => ({}));
  await s.render(createElement(KycStep, { kyc, quote: null, email: "fake-test-only@example.com", onApproved: () => {} }));
  assert.match(s.text(), /Estes dados passam pela Vortex e seguem para a Avenia/);
  assert.doesNotMatch(s.text(), /direto para a Avenia/);
}));

test("a failed row shows its operation code; a completed one does not", () => harness(async (s) => {
  const row = { id: "ramp-1", direction: "BUY", symbol: "NVDA", brlAmount: 500, tokenAmount: "0.42", date: 1000, simulated: false, explorerLink: null };
  await s.render(createElement(ActivityRow, { row: { ...row, status: "failure" } }));
  assert.match(s.text(), /Não concluída/);
  assert.match(s.text(), /Código da operação: ramp-1/);
  assert.doesNotMatch(s.text(), /\+0,42/, "no credit is claimed");
  await s.render(createElement(ActivityRow, { row: { ...row, status: "success" } }));
  assert.doesNotMatch(s.text(), /ramp-1/);
  assert.match(s.text(), /\+0,42/);
}));

test("an unstarted row claims no movement", () => harness(async (s) => {
  const row = { id: "ramp-1", direction: "SELL", symbol: "NVDA", brlAmount: 500, tokenAmount: "0.5", date: 1000, simulated: false, explorerLink: null };
  await s.render(createElement(ActivityRow, { row: { ...row, status: "unstarted" } }));
  assert.match(s.text(), /Não iniciada/);
  assert.doesNotMatch(s.text(), /Em andamento|−0,5/);
}));

function PendingRead(props) { usePendingRampRead(props); return null; }
function pendingRead({ session = true, read = async () => ({ classification: "processing" }) } = {}) {
  const calls = { reads: [], settled: 0 };
  const runtime = { verification: { hasSession: (who) => session && who.privyDid === "did:privy:fake" }, adapter: { getRamp: async (...args) => { calls.reads.push(args); return read(); } } };
  return { calls, props: { runtime, rampId: "ramp-1", walletAddress: WALLET, who: { privyDid: "did:privy:fake" }, idle: true, onSettled: () => { calls.settled += 1; } } };
}

test("with a session, the banner's ramp is read once and a finished one refreshes the screen", () => harness(async (s) => {
  const { calls, props } = pendingRead({ read: async () => ({ classification: "success" }) });
  await s.render(createElement(PendingRead, props));
  assert.deepEqual(calls.reads, [["ramp-1", { walletAddress: WALLET }]]);
  assert.equal(calls.settled, 1);
  await s.render(createElement(PendingRead, { ...props, who: { privyDid: "did:privy:fake" } }));
  assert.equal(calls.reads.length, 1, "once");
}));

test("a ramp still running leaves the banner; a failed read is quiet", () => harness(async (s) => {
  const running = pendingRead();
  await s.render(createElement(PendingRead, running.props));
  assert.equal(running.calls.reads.length, 1);
  assert.equal(running.calls.settled, 0);
  const failing = pendingRead({ read: async () => { throw new Error("offline"); } });
  await s.render(createElement(PendingRead, failing.props));
  assert.equal(failing.calls.settled, 0);
}));

test("the app reads the banner's ramp while no flow is open", () => {
  const app = sourceFiles().find((file) => file.path === "src/App.jsx").text;
  assert.match(app, /usePendingRampRead\(\{ runtime, rampId: pending\?\.rampId, walletAddress: address, who: \{ email: auth\.user\?\.email, privyDid: auth\.user\?\.privyDid \}, idle: !modal, onSettled: /);
});

test("the app reads the server history for Home as well as for the history screen", () => {
  const app = sourceFiles().find((file) => file.path === "src/App.jsx").text;
  assert.match(app, /if \(!runtime \|\| !signedIn \|\| !\["home", "history"\]\.includes\(route\.name\)\) return undefined;/);
});

test("without a session nothing is read (it never asks for the code), nor while a flow is open or with no ramp", () => harness(async (s) => {
  const none = pendingRead({ session: false });
  await s.render(createElement(PendingRead, none.props));
  assert.deepEqual(none.calls.reads, []);
  const open = pendingRead();
  await s.render(createElement(PendingRead, { ...open.props, idle: false }));
  assert.deepEqual(open.calls.reads, []);
  await s.render(createElement(PendingRead, { ...open.props, idle: true }));
  assert.equal(open.calls.reads.length, 1, "read when the flow closes");
  const empty = pendingRead();
  await s.render(createElement(PendingRead, { ...empty.props, rampId: undefined }));
  assert.deepEqual(empty.calls.reads, []);
}));

// The whole app, as a live build and as a demo build. Node sees no build-time mode, so what is under
// test is the runtime gate; CI's live-bundle step checks that the chunks are gone too.
const LIVE = readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: "fake-test-only" });
const DEMO = readConfig({ VITE_STOCKS_MODE: "demo" });
const appAuth = (authenticated) => ({ kind: "demo", status: authenticated ? "authenticated" : "anonymous", authenticated, address: authenticated ? WALLET : null, user: authenticated ? { privyDid: "did:privy:fake", email: "fake-test-only@example.com" } : null, login: async () => {}, logout: async () => {} });
const noNetwork = async () => { throw new TypeError("Failed to fetch"); };
const renderApp = (s, config, authenticated) => s.render(createElement(App, { auth: appAuth(authenticated), config }));
const saveSelection = (method, amount) => sessionStorage.setItem(STOCKS_KEYS.purchaseIntent, JSON.stringify({ symbol: "NVDA", method, amount, locale: "pt-BR", createdAt: Date.now() }));
const englishLink = () => [...document.querySelectorAll("a")].some((link) => link.getAttribute("href") === "/en/stocks/");
const untilText = async (s, pattern) => { for (let i = 0; i < 2000 && !pattern.test(s.text()); i += 1) await s.wait(); assert.match(s.text(), pattern); };

test("signed out, a demo build offers the USDC simulation and a live build offers Pix only", () => withFetch(noNetwork, () => harness(async (s) => {
  await renderApp(s, DEMO, false);
  assert.ok(s.has("USDC · na Base"));
  assert.ok(englishLink());
  await renderApp(s, LIVE, false);
  assert.ok(s.has("Pix · em reais"));
  assert.ok(!s.has("USDC · na Base"));
  assert.ok(!englishLink());
})));

// A saved amount skips the amount step; "Voltar" returns to it.
const openBuyAmount = async (s, config) => {
  saveSelection("pix", "500");
  await renderApp(s, config, true);
  await untilText(s, /Etapa 2 de 4/);
  await s.click("Voltar");
  await untilText(s, /Quanto deseja investir\?/);
};

test("signed in, the buy offers USDC only outside a live build, and a saved USDC choice opens nothing live", () => withFetch(noNetwork, async () => {
  await harness(async (s) => {
    await openBuyAmount(s, DEMO);
    assert.match(s.text(), /USDC · Base/);
  });
  await harness(async (s) => {
    await openBuyAmount(s, LIVE);
    assert.doesNotMatch(s.text(), /USDC · Base/);
  });
  await harness(async (s) => {
    saveSelection("usdc", "100");
    await renderApp(s, LIVE, true);
    await untilText(s, /NVDA/);
    for (let i = 0; i < 20; i += 1) await s.wait();
    assert.equal(document.querySelector(".sheet"), null);
    assert.doesNotMatch(s.text(), /USDC/);
  });
}));

test("a resumed record for a token this build no longer bundles still opens its operation", () => withFetch(noNetwork, () => harness(async (s) => {
  createRampStores({ simulated: true }).activeRamp.save({ rampId: "sim-delisted", walletAddress: WALLET, rampType: "BUY", stage: "registered", symbol: "DELISTED", inputAmount: 500, outputAmount: "0.5", createdAt: Date.now(), simulated: true });
  try {
    window.location.hash = "#/";
    await renderApp(s, DEMO, true);
    await untilText(s, /Você tem uma operação em andamento/);
    await act(async () => document.querySelector(".resume-banner").click());
    for (let i = 0; i < 200 && !document.querySelector(".sheet"); i += 1) await s.wait();
    assert.ok(document.querySelector(".sheet"), "a sheet opens");
    assert.match(s.text(), /DELISTED/);
  } finally { sessionStorage.removeItem(STOCKS_KEYS.simActiveRamp); }
})));
