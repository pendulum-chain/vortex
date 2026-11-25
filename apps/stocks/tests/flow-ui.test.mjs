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
const { default: LiveUsdcFlow } = await flow("../src/flows/LiveUsdcFlow.jsx");
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

// With USDC checkout on, the Pix flow is never the default: a USDC order must not reach the Pix KYC.
const PIX_BUY = "Pix · Brasil Em reais, pelo seu banco";
const USDC_BUY = "USDC · Base Da sua carteira ou exchange";

test("with USDC on, a buy asks Pix or USDC before any Pix step", () => harness(async (s) => {
  let usdc = 0;
  await s.render(createElement(BuyFlow, { ...fixtures(notReady("not_started")), onPayUsdc: () => { usdc += 1; } }));
  assert.match(s.text(), /Como deseja pagar\?/);
  assert.doesNotMatch(s.text(), /Quanto deseja investir\?/);
  await s.click(USDC_BUY);
  assert.equal(usdc, 1);
  await s.click(PIX_BUY);
  assert.match(s.text(), /Quanto deseja investir\?/);
  await s.click("Voltar");
  assert.match(s.text(), /Como deseja pagar\?/);
  await s.click(PIX_BUY);
  await s.click("Continuar");
  assert.match(s.text(), KYC_FORM, "Pix keeps its KYC");
}));

test("with USDC on, a sell asks Pix or USDC before the Pix key", () => harness(async (s) => {
  let usdc = 0;
  await s.render(createElement(SellFlow, { ...fixtures(notReady("not_started")), holdingRaw: 10n ** 18n, onSellUsdc: () => { usdc += 1; } }));
  assert.match(s.text(), /Como deseja receber\?/);
  assert.ok(document.querySelector('[role="group"][aria-label="Forma de recebimento"]'), "a payout, not a payment");
  assert.equal(document.querySelector("#sell-amount"), null);
  await s.click("USDC · Base Na sua carteira, na rede Base");
  assert.equal(usdc, 1);
  await s.click("Pix · Brasil Em reais, na sua chave Pix");
  await s.click("Voltar");
  assert.match(s.text(), /Como deseja receber\?/);
  await s.click("Pix · Brasil Em reais, na sua chave Pix");
  await sellAmount(s);
  assert.match(s.text(), KYC_FORM, "Pix keeps its KYC");
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

test("with USDC on, a resumed Pix operation and the demo deep links skip the method step", async () => {
  await harness(async (s) => {
    const { props } = resumed({ ramp: initial() });
    await s.render(createElement(BuyFlow, { ...props, onPayUsdc: () => {} }));
    await s.wait();
    assert.match(s.text(), /Código da operação/);
    assert.doesNotMatch(s.text(), /Como deseja pagar\?/, "a resumed Pix operation never offers USDC");
  });
  await harness(async (s) => {
    await s.render(createElement(BuyFlow, { ...fixtures(approved), demoQuote: true, onPayUsdc: () => {} }));
    assert.doesNotMatch(s.text(), /Como deseja pagar\?/, "buy-quote");
  });
  await harness(async (s) => {
    await s.render(createElement(SellFlow, { ...fixtures(approved), holdingRaw: 10n ** 18n, demoReserveUsed: true, onSellUsdc: () => {} }));
    assert.doesNotMatch(s.text(), /Como deseja receber\?/, "sell-reserve-used");
  });
});

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
  assert.match(s.text(), /nova venda em até 15 minutos contados deste registro/, "the open-sale rule can refuse a new one until then");
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
    assert.equal(Boolean(document.querySelector(".spinner")), false);
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

test("a sell settled as expired while confirming ends on the issue screen, not on its wallet step", () => harness(async (s) => {
  const props = fixtures(approved);
  Object.assign(props.runtime.adapter, { registerSell: async ({ onRegistered }) => { onRegistered({ id: "ramp-1" }); throw Object.assign(new Error("O prazo para confirmar esta venda terminou, e nada saiu da sua carteira. Comece uma nova venda."), { code: "SELL_EXPIRED" }); } });
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  await sellAmount(s);
  await s.check();
  await s.click("Confirmar venda");
  assert.match(s.text(), /Comece uma nova venda/);
  assert.equal(s.has("Continuar esta venda"), false);
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
    await s.click("Voltar");
    assert.match(s.text(), /Como deseja pagar\?/);
    assert.match(s.text(), /USDC · Base/);
  });
  await harness(async (s) => {
    await openBuyAmount(s, LIVE);
    assert.ok(!s.has("Voltar"), "no method step to go back to");
    assert.doesNotMatch(s.text(), /USDC · Base/);
  });
  await harness(async (s) => {
    saveSelection("usdc", "100");
    await renderApp(s, LIVE, true);
    await untilText(s, /NVDA/);
    for (let i = 0; i < 20; i += 1) await s.wait();
    assert.equal(Boolean(document.querySelector(".sheet")), false);
    assert.doesNotMatch(s.text(), /USDC/);
  });
}));

// The runtime is one instance per page (useRuntime), so an earlier demo render may serve this one:
// the check is the wiring from the detail button to the USDC buy, which does not depend on it.
test("signed in with Pix off and USDC on, the stock page opens the USDC buy", () => withFetch(noNetwork, () => harness(async (s) => {
  const usdcOnly = readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: "fake-test-only", VITE_STOCKS_USDC_ENABLED: "true" });
  try {
    window.location.hash = "#/acao/NVDA";
    await renderApp(s, usdcOnly, true);
    await untilText(s, /Você já pode comprar e vender com USDC na Base/);
    await s.click("Comprar com USDC");
    await untilText(s, /Comprar NVDA · USDC|Buy NVDA with USDC/);
  } finally { window.location.hash = "#/"; }
})));

// Regression: with both open, "Comprar" went straight to the Pix amount, and on to the Pix KYC.
test("signed in with Pix and USDC on, the stock page's Comprar asks how to pay and USDC opens the USDC buy", () => withFetch(noNetwork, () => harness(async (s) => {
  const buyReady = () => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Comprar" && !button.disabled);
  try {
    window.location.hash = "#/acao/NVDA";
    await renderApp(s, DEMO, true);
    for (let i = 0; i < 2000 && !buyReady(); i += 1) await s.wait();
    assert.ok(buyReady(), "the stock page's Comprar is enabled (no earlier operation left pending)");
    await s.click("Comprar");
    await untilText(s, /Como deseja pagar\?/);
    assert.doesNotMatch(s.text(), /Quanto deseja investir\?/);
    await s.click(USDC_BUY);
    await untilText(s, /Comprar NVDA · USDC|Buy NVDA with USDC/);
  } finally { window.location.hash = "#/"; }
})));

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

function liveUsdcFixtures(locale = "en") {
  const calls = { register: 0, resume: 0, start: 0 }, intents = new Map();
  let balance = 0n, active = null;
  const liveQuote = { ...quote, direction: "BUY", usdcAmount: 100, tokenAmount: "0.5", symbol: "NVDA", gasReserve: null,
    fees: { network: 0.15, service: 0.05, total: 0.20, currency: "USDC" },
    rawQuote: { inputAmount: "100", outputAmount: "0.5", totalFeeFiat: "0.20", anchorFeeFiat: "0", vortexFeeFiat: "0.05", networkFeeFiat: "0.15", routingStrategy: "direct" } };
  const ramp = { id: "live-usdc-order", direction: "BUY", symbol: "NVDA", currentPhase: "initial", classification: "processing" };
  const adapter = { getAvailability: async () => open, getMaintenanceStatus: async () => ({ active: false }), quoteBuy: async () => ({ ...liveQuote, expiresAt: Date.now()+60000 }),
    registerBuy: async ({ onRegistered }) => { calls.register++; active = { rampId: ramp.id }; onRegistered(ramp); throw new Error("rejected"); },
    resumeSell: async () => { calls.resume++; return ramp; }, startRamp: async () => { calls.start++; }, getRamp: async () => ({...ramp,currentPhase:"relayBridge"}) };
  const props = fixtures(notReady("not_started"));
  props.runtime = { ...props.runtime, locale, baseChain: { id:8453 },
    usdc: { enabled:true, simulated:false, adapter, refreshBalance: async () => balance },
    fundingIntents: { get: owner => intents.get(owner), save: (owner,value) => intents.set(owner,value), clear: owner => intents.delete(owner) },
    activeRampStore: { get: () => active } };
  return { props, calls, intents, fund: value => { balance = value; } };
}

for (const [locale, quoteLabel, sendLabel, resendLabel, verifyLabel, sentText] of [
  ["pt-BR", "Ver cotação", "Enviar código por e-mail", "Reenviar código", "Confirmar código", /Código enviado para/],
  ["en", "Get quote", "Send email code", "Resend code", "Verify code", /Code sent to/],
]) test(`USDC ${locale} replaces the send action with code entry after delivery`, () => harness(async s => {
  const f = liveUsdcFixtures(locale);
  let requests = 0, attempts = 0;
  f.props.runtime.verification = {
    hasSession: () => false,
    requestOtp: async () => { requests++; },
    verifyOtp: async (_email, code) => {
      attempts++;
      assert.equal(code.length, 6);
      if (attempts === 1) throw Object.assign(new Error("Invalid code"), { status: 401 });
    },
  };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click(quoteLabel);
  assert.equal(requests, 0);
  assert.equal(s.has(resendLabel), false);
  await s.click(sendLabel);
  assert.equal(requests, 1);
  assert.match(document.querySelector(".flow-section [role=status]")?.textContent, sentText);
  assert.equal(s.has(sendLabel), false);
  assert.equal(document.activeElement, document.querySelector(".otp-input"));
  await s.type(".otp-input", "111111");
  await s.click(verifyLabel);
  assert.equal(s.has(resendLabel), true);
  await s.click(resendLabel);
  assert.equal(requests, 2);
  assert.equal(document.querySelector(".otp-input").value, "");
  await s.type(".otp-input", "222222");
  await s.click(verifyLabel);
  assert.equal(attempts, 2);
  assert.equal(s.has(quoteLabel), true);
  assert.equal(f.calls.register, 0);
}));

test("live USDC offers a manual transfer fallback without fiat KYC or purchase authorization", () => harness(async s => {
  const f = liveUsdcFixtures();
  await s.render(createElement(LiveUsdcFlow, f.props));await s.click("Get quote");
  assert.doesNotMatch(s.text(), KYC_FORM);await s.click("Add USDC");
  assert.match(s.text(), /Amount to add to your fatia/);assert.match(s.text(), new RegExp(WALLET));
  assert.equal(document.querySelector(".checkout-manual").open, true);
  assert.equal(document.querySelector(".checkout-qr").open, false);
  assert.doesNotMatch(s.text(), /Simulate incoming|Simulate wallet|Simulation/);
  assert.equal(f.calls.register,0);assert.equal(f.intents.size,1);
  assert.equal(s.has("Review fresh quote"), false);
  await s.click("Change amount");assert.equal(f.intents.size,0);assert.equal(f.calls.register,0);
}));

test("USDC wallet connection does not send funds; explicit transfer still requires fresh review", () => harness(async s => {
  const f = liveUsdcFixtures();
  const sender = { address: "0x00000000000000000000000000000000000000d1" };
  const transfers = [];
  let pending = null;
  f.fund(25_000_000n);
  f.props.auth.connectFundingWallet = async () => sender;
  f.props.runtime.usdc.walletFunding = {
    supported: true,
    pending: () => pending,
    check: async () => null,
    send: async details => {
      transfers.push(details);
      pending = { hash: `0x${"1".repeat(64)}` };
    },
  };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Get quote");
  await s.click("Add USDC");
  assert.equal(document.querySelector(".checkout-manual").open, false);
  await s.click("Connect wallet");
  assert.equal(transfers.length, 0);
  assert.ok(s.has("Transfer USDC"));
  await s.click("Transfer USDC");
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].owner, WALLET);
  assert.equal(transfers[0].shortfall, 75_000_000n);
  assert.equal(transfers[0].wallet.address, sender.address);
  assert.match(s.text(), /Waiting for Base confirmations/);
  assert.equal(s.has("Transfer USDC"), false);
  assert.equal(f.calls.register, 0);
}));

test("incoming funds reenter the purchase review, with no permit until explicit approval", () => harness(async s => {
  const f = liveUsdcFixtures();
  f.fund(100_000_000n);
  f.intents.set(WALLET, { symbol: "NVDA", direction: "BUY", amount: "100", quote: await f.props.runtime.usdc.adapter.quoteBuy() });
  await s.render(createElement(LiveUsdcFlow, f.props));
  await untilText(s, /Funding complete/);
  await s.click("Review fresh quote");
  assert.equal(f.calls.register, 0);
  assert.equal([...document.querySelectorAll("button")].find(b => b.textContent === "Confirm and authorize")?.disabled, true);
}));
test("a cancelled USDC permit resumes the same registered order instead of registering twice", () => harness(async s => {
  const f = liveUsdcFixtures();f.fund(100000000n);
  await s.render(createElement(LiveUsdcFlow,f.props));await s.click("Get quote");await s.check();await s.click("Confirm and authorize");
  assert.equal(f.calls.register,1);assert.match(s.text(),/live-usdc-order/);assert.ok(s.has("Resume order"));
  await s.click("Resume order");assert.equal(f.calls.register,1);assert.equal(f.calls.resume,1);assert.equal(f.calls.start,1);
}));
test("Brazilian live USDC uses Portuguese copy and the same provider costs",()=>harness(async s=>{
  const f=liveUsdcFixtures("pt-BR");await s.render(createElement(LiveUsdcFlow,f.props));await s.click("Ver cotação");
  assert.ok(document.querySelector(".fee-card .fee-summary > summary"));assert.match(s.text(),/Ver detalhes/);assert.match(s.text(),/100,00 USDC/);assert.match(s.text(),/0,5000 NVDA/);assert.match(s.text(),/Taxas informadas/);assert.doesNotMatch(s.text(),/Illustrative provider/);
}));

test("Brazilian live USDC words a cancelled permit in Portuguese and keeps the same order", () => harness(async s => {
  const f = liveUsdcFixtures("pt-BR");f.fund(100000000n);
  f.props.runtime.usdc.adapter.registerBuy = async ({ onRegistered }) => { f.calls.register++; onRegistered({ id: "live-usdc-order" }); throw Object.assign(new Error("User rejected the request."), { code: 4001 }); };
  await s.render(createElement(LiveUsdcFlow, f.props));await s.click("Ver cotação");await s.check();await s.click("Confirmar e autorizar");
  assert.match(document.querySelector("[role=alert]").textContent, /Confirmação cancelada\. Você pode continuar esta mesma operação\./);
  assert.doesNotMatch(s.text(), /User rejected/);assert.ok(s.has("Retomar operação"));
}));

for (const direction of ["BUY", "SELL"]) test(`live USDC ${direction} success displays the asset actually received`,()=>harness(async s=>{
  const f=liveUsdcFixtures();
  f.props.direction=direction;f.props.resume={rampId:"completed-usdc-order"};
  f.props.runtime.usdc.adapter.resumeSell=async()=>({ id:"completed-usdc-order", classification:"success", tokenAmount:"0.5", usdcAmount:"70" });
  await s.render(createElement(LiveUsdcFlow,f.props));await s.click("Resume order");
  const receipt=document.querySelector(".result__amount").textContent;
  assert.match(receipt,direction==="SELL"?/70.*USDC/:/0.5.*NVDA/);
  assert.doesNotMatch(receipt,direction==="SELL"?/NVDA/:/USDC/);
}));

test("a saved USDC order remains resumable when new USDC purchases are disabled",()=>harness(async s=>{
  const f=liveUsdcFixtures();f.props.runtime.usdc.enabled=false;f.props.resume={rampId:"saved-order"};
  f.props.runtime.usdc.adapter.resumeSell=async()=>({id:"saved-order",classification:"success",tokenAmount:"0.5",usdcAmount:"70"});
  await s.render(createElement(LiveUsdcFlow,f.props));assert.ok(s.has("Resume order"));await s.click("Resume order");
  assert.match(s.text(),/Your Stock Tokens have arrived/);assert.doesNotMatch(s.text(),/USDC is coming soon/);
}));


for (const reserve of [null, { brl: 0.71, ethAmount: "0.00005" }]) {
  test(`Pix review renders retained ETH separately when quoted: ${Boolean(reserve)}`, () => harness(async s => {
    const props = fixtures(approved);
    props.runtime.adapter.quoteBuy = async () => ({ ...quote, gasReserve: reserve, fees: { ...quote.fees, total: 3 + (reserve?.brl || 0) } });
    await s.render(createElement(BuyFlow, props));
    await s.click("Continuar");
    const line = document.querySelector(".reserve-balance");
    assert.equal(Boolean(line), Boolean(reserve));
    if (line) {
      assert.match(line.textContent.replace(/\u00a0/g, " "), /Saldo para futuras taxas.*R\$ 0,71/);
      assert.equal(line.closest(".fee-summary"), null);
      assert.match(line.textContent, /Não é uma taxa cobrada/);
    }
    assert.match(document.querySelector(".fee-summary > summary").textContent.replace(/\u00a0/g, " "), /R\$ 3,00/);
  }));
}

for (const useSaved of [true, false]) test("a different funding draft requires a choice, use saved = " + useSaved, () => harness(async s => {
  const f = liveUsdcFixtures(), api = f.props.runtime.usdc;
  const quote = await api.adapter.quoteBuy();
  f.intents.set(WALLET, { amount: "100", symbol: "NVDA", direction: "BUY", quote });
  const quoted = [];
  api.adapter.quoteBuy = async ({ brlAmount }) => {
    quoted.push(brlAmount);
    return { ...quote, usdcAmount: brlAmount, rawQuote: { ...quote.rawQuote, inputAmount: brlAmount } };
  };
  api.walletFunding = { supported: true, pending: () => ({ hash: "0x" + "1".repeat(64) }), check: async () => null };
  await s.render(createElement(LiveUsdcFlow, { ...f.props, initialAmount: "25" }));
  assert.ok(s.has("Use new amount · 25 USDC") && s.has("Continue saved amount · 100 USDC"));
  assert.equal(s.has("Transfer USDC"), false);
  if (useSaved) {
    await s.click("Continue saved amount · 100 USDC");
    assert.deepEqual(quoted, []);
    assert.equal(f.intents.get(WALLET).amount, "100");
  } else {
    await s.click("Use new amount · 25 USDC");
    assert.equal(document.querySelector("#live-usdc-amount").value, "25");
    await s.click("Get quote"); await s.click("Add USDC");
    assert.deepEqual(quoted, ["25"]);
    assert.equal(f.intents.get(WALLET).amount, "25");
  }
  assert.match(s.text(), /Waiting for Base confirmations/);
  assert.equal(s.has("Transfer USDC"), false);
  assert.equal(f.calls.register, 0);
}));

test("an error before registration asks for a fresh quote and fresh consent", () => harness(async s => {
  const f = liveUsdcFixtures(); f.fund(100_000_000n);
  const api = f.props.runtime.usdc.adapter;
  const original = api.quoteBuy;
  let quoted = 0;
  api.quoteBuy = async args => { quoted++; return original(args); };
  api.registerBuy = async () => { f.calls.register++; throw new Error("provider offline"); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Get quote"); await s.check(); await s.click("Confirm and authorize");
  assert.ok(s.has("Review a fresh quote"));
  assert.doesNotMatch(s.text(), /unfinished order|Order reference|Resume order/i);
  await s.click("Review a fresh quote");
  assert.equal(quoted, 2);
  assert.equal(document.querySelector(".check input").checked, false);
  assert.equal(f.calls.register, 1);
}));

test("a durable registration checkpoint survives a failure before the UI callback", () => harness(async s => {
  const f = liveUsdcFixtures(); f.fund(100_000_000n);
  let record;
  f.props.runtime.activeRampStore.get = () => record;
  f.props.runtime.usdc.adapter.registerBuy = async ({ quote }) => {
    f.calls.register++;
    record = { quoteId: quote.id, paymentMethod: "usdc", symbol: "NVDA", rampType: "BUY", rampId: "durable-order" };
    throw new Error("disconnected");
  };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Get quote"); await s.check(); await s.click("Confirm and authorize");
  assert.match(s.text(), /durable-order/);
  await s.click("Resume order");
  assert.equal(f.calls.register, 1);
  assert.equal(f.calls.resume, 1);
}));

test("selling stock tokens works when the Base balance RPC is unavailable", () => harness(async s => {
  const f = liveUsdcFixtures("pt-BR"), api = f.props.runtime.usdc;
  const q = await api.adapter.quoteBuy();
  let reads = 0, received;
  api.refreshBalance = async () => { reads++; throw new Error("Base offline"); };
  api.adapter.quoteSell = async ({ tokenAmount }) => { received = tokenAmount; return { ...q, direction: "SELL", tokenAmount }; };
  api.adapter.registerSell = async () => { f.calls.register++; return { id: "stock-sale" }; };
  await s.render(createElement(LiveUsdcFlow, { ...f.props, direction: "SELL" }));
  await s.type("#live-usdc-amount", "0,123456789012345678");
  await s.click("Ver cotação"); await s.check(); await s.click("Confirmar e autorizar");
  assert.equal(received, "0.123456789012345678");
  assert.equal(reads, 0);
  assert.equal(f.calls.register, 1);
  assert.equal(f.calls.start, 1);
}));

test("Base balance distinguishes loading, offline, last confirmed, zero and a new wallet", () => harness(async s => {
  const { BaseUsdcBalance } = await flow("../src/components/BaseUsdcBalance.jsx");
  const reads = [], cache = new Map();
  const api = { enabled: true, simulated: false, balanceRaw: owner => cache.get(owner) ?? null,
    refreshBalance: owner => new Promise((resolve, reject) => reads.push({ reject, ok(raw) { cache.set(owner, raw); resolve(raw); } })) };
  const render = (owner, version) => s.render(createElement(BaseUsdcBalance, { api, owner, refreshKey: version }));
  await render(WALLET, 0); assert.match(s.text(), /Checking balance/);
  await act(async () => reads[0].reject(new Error())); assert.match(s.text(), /Balance unavailable/);
  await render(WALLET, 1);
  await act(async () => reads[1].ok(25_000_000n)); assert.match(s.text(), /25.0000 USDC/);
  await render(WALLET, 2);
  await act(async () => reads[2].reject(new Error())); assert.match(s.text(), /25.0000 USDC \(last confirmed/);
  await render("other", 0); assert.doesNotMatch(s.text(), /25.0000/);
  await act(async () => reads[3].ok(0n)); assert.match(s.text(), /0.0000 USDC$/);
  const disabled = { ...api, enabled: false };
  await s.render(createElement(BaseUsdcBalance, { api: disabled, owner: WALLET }));
  assert.equal(reads.length, 4);
  assert.doesNotMatch(s.text(), /USDC: [0-9]/);
}));

test("a concurrent USDC order for a different quote never resumes under this purchase", () => harness(async s => {
  const f = liveUsdcFixtures(); f.fund(100_000_000n);
  let active;
  f.props.runtime.activeRampStore.get = () => active;
  f.props.runtime.usdc.adapter.registerBuy = async () => {
    active = { rampId: "different-order", paymentMethod: "usdc", rampType: "BUY", symbol: "NVDA", quoteId: "other-quote" };
    throw new Error("already open");
  };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Get quote"); await s.check(); await s.click("Confirm and authorize");
  assert.match(s.text(), /Another order is already open/);
  assert.equal(s.has("Resume order"), false);
  assert.equal(f.calls.start, 0);
}));

test("pasting whole reais with centavos preserves the Pix quote amount", () => harness(async s => {
  const props = fixtures({ kycStatus: "approved", canBuy: true });
  const requested = [];
  props.runtime.adapter.quoteBuy = async ({ brlAmount }) => { requested.push(brlAmount); return quote; };
  await s.render(createElement(BuyFlow, props));
  await s.type("#buy-amount", "500,25"); await s.click("Continuar");
  assert.deepEqual(requested, []);
  await s.type("#buy-amount", "500,00"); await s.click("Continuar");
  assert.deepEqual(requested, [500]);
}));

// Top-ups from an external wallet. The fake is the app's contract, not its storage: see usdc-wallet-funding.test.mjs.
const SENDER = "0x00000000000000000000000000000000000000d1";
async function fundingFixtures(locale = "en", pending = null) {
  const f = liveUsdcFixtures(locale), api = f.props.runtime.usdc, sent = [];
  f.fund(25_000_000n);
  const state = { pending, sent, send: async () => {}, acknowledge: async () => { state.pending = null; }, status: null };
  f.props.auth.connectFundingWallet = async () => ({ address: SENDER });
  api.walletFunding = { supported: true, pending: () => state.pending, check: async () => state.status,
    send: async details => { sent.push(details); await state.send(); }, acknowledgeUnsent: (owner, shown) => state.acknowledge(shown) };
  f.intents.set(WALLET, { symbol: "NVDA", direction: "BUY", amount: "100", quote: await api.adapter.quoteBuy() });
  return { ...f, api, state, sent };
}
const alertText = () => document.querySelector("[role=alert]")?.textContent ?? "";
const unsent = (patch = {}) => ({ hash: null, requestedAt: Date.now() - 60_000, from: SENDER, amount: "75000000", ...patch });

for (const [name, close, expected] of [
  ["a closed direction", f => { f.api.adapter.getAvailability = async () => ({ NVDA: { buy: false, sell: true } }); }, /temporarily unavailable/],
  ["maintenance", f => { f.api.adapter.getMaintenanceStatus = async () => ({ active: true }); }, /paused/],
  ["an unreadable maintenance status", f => { f.api.adapter.getMaintenanceStatus = async () => null; }, /could not verify service/],
  ["a refused quote", f => { f.api.adapter.quoteBuy = async () => { throw Object.assign(new Error("no"), { code: "INVALID_QUOTE" }); }; }, /Get a fresh quote/],
]) test(`a saved top-up asks the wallet for nothing during ${name}`, () => harness(async s => {
  const f = await fundingFixtures();
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  close(f);
  await s.click("Transfer USDC");
  assert.equal(f.sent.length, 0);
  assert.match(alertText(), expected);
}));

test("an expired session asks for the code before a top-up and comes back to it", () => harness(async s => {
  const f = await fundingFixtures();
  let session = true;
  f.props.runtime.verification = { hasSession: () => session, requestOtp: async () => {}, verifyOtp: async () => { session = true; } };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  session = false;
  await s.click("Transfer USDC");
  assert.equal(f.sent.length, 0);
  await s.click("Send email code"); await s.type(".otp-input", "111111"); await s.click("Verify code");
  await s.click("Transfer USDC");
  assert.equal(f.sent.length, 1);
}));

test("the checks before a top-up leave the reviewed quote alone, so the next review compares with it", () => harness(async s => {
  const f = await fundingFixtures();
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  const original = f.api.adapter.quoteBuy, worse = async () => ({ ...(await original()), tokenAmountWei: "400000000000000000" });
  f.api.adapter.quoteBuy = worse;
  f.state.send = async () => { throw Object.assign(new Error("no"), { code: 4001 }); };
  await s.click("Transfer USDC"); await s.click("Change amount"); await s.click("Get quote");
  assert.doesNotMatch(s.text(), /changed beyond your earlier limits/, "a new amount has no earlier limits");
}));

test("a price that moved between the review and the arrival is pointed out in the new review", () => harness(async s => {
  const f = await fundingFixtures();
  const original = f.api.adapter.quoteBuy;
  f.api.adapter.quoteBuy = async () => ({ ...(await original()), tokenAmountWei: "400000000000000000" });
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  f.state.send = async () => { f.fund(100_000_000n); throw Object.assign(new Error("no"), { code: 4001 }); };
  await s.click("Transfer USDC");
  f.fund(100_000_000n);
  await untilText(s, /Funding complete/);
  await s.click("Review fresh quote");
  assert.match(s.text(), /changed beyond your earlier limits/);
}));

test("a reverted transfer says so, and its receipt is read before the balance", () => harness(async s => {
  const f = await fundingFixtures("en", unsent({ hash: "0x" + "1".repeat(64) })), order = [], refresh = f.api.refreshBalance;
  f.api.walletFunding.check = async () => { order.push("receipt"); f.state.pending = null; return "reverted"; };
  f.api.refreshBalance = async owner => { order.push("balance"); return refresh(owner); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await untilText(s, /The transfer failed on Base/);
  assert.deepEqual(order, ["receipt", "balance"]);
  assert.ok(s.has("Connect wallet"));
}));

test("a transfer is tied to the open checkout", () => harness(async s => {
  const f = await fundingFixtures();
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet"); await s.click("Transfer USDC");
  assert.equal(f.sent[0].isCurrent(), true);
  await s.render(createElement(LiveUsdcFlow, { ...f.props, auth: { ...f.props.auth, address: SENDER } }));
  assert.equal(f.sent[0].isCurrent(), false, "another account");
  await s.render(null);
  assert.equal(f.sent[0].isCurrent(), false, "closed");
}));

test("a top-up asks for the shortfall of the fresh quote, and the balance check compares the two", () => harness(async s => {
  const f = await fundingFixtures();
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  const original = f.api.adapter.quoteBuy;
  f.api.adapter.quoteBuy = async () => { const q = await original(); return { ...q, rawQuote: { ...q.rawQuote, inputAmount: "101" } }; };
  await s.click("Transfer USDC");
  assert.equal(f.sent[0].shortfall, 75_000_000n, "the amount the buyer saw");
  assert.equal(f.sent[0].required, 101_000_000n, "funding.send refuses the pair: FUNDING_BALANCE_CHANGED");
}));

for (const [name, error, after, expected] of [
  ["cancelled in the wallet", { code: 4001 }, null, /cancelled in your wallet/],
  ["cancelled over WalletConnect", { code: 5000 }, null, /cancelled in your wallet/],
  ["stopped before the prompt", {}, null, /was not sent/],
  ["without a checkpoint", { code: "MANUAL_FUNDING_REQUIRED" }, null, /Send the USDC manually/],
  ["left open in the wallet", {}, unsent(), /Check your wallet activity/],
]) test(`a transfer ${name} says what happened`, () => harness(async s => {
  const f = await fundingFixtures();
  f.state.send = async () => { f.state.pending = after; throw Object.assign(new Error("raw wallet error"), error); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet"); await s.click("Transfer USDC");
  assert.match(alertText(), expected);
  assert.doesNotMatch(s.text(), /raw wallet error/);
  assert.equal(s.has("Transfer USDC"), after === null);
}));

test("after a reload an open request names its wallet and amount, and the manual address stays away", () => harness(async s => {
  const f = await fundingFixtures("en", unsent({ requestedAt: Date.now() }));
  await s.render(createElement(LiveUsdcFlow, f.props));
  assert.match(s.text(), /Check the sending wallet/);
  assert.match(s.text(), /choose again in a minute/);
  assert.equal(document.querySelector(".checkout-status code").title, SENDER);
  assert.match(document.querySelector(".checkout-status").textContent, /75\.00.*USDC/);
  assert.equal(s.has("Connect wallet"), false);
  assert.doesNotMatch(s.text(), new RegExp(WALLET));
  assert.doesNotMatch(s.text(), /Transfer help/, "too early: the wallet may still show the request");
}));

test("discarding an uncertain transfer takes a statement about that transfer", () => harness(async s => {
  const f = await fundingFixtures("en", unsent());
  let discarded = 0;
  const shown = f.state.pending;
  f.state.acknowledge = async about => { assert.equal(about, shown); discarded++; f.state.pending = null; };
  await s.render(createElement(LiveUsdcFlow, f.props));
  assert.match(s.text(), /No transfer request is open and no transfer is pending/);
  await s.click("Choose payment again");
  assert.equal(discarded, 0, "disabled until the box is ticked");
  await s.check(); await s.click("Choose payment again");
  assert.equal(discarded, 1);
  // The next uncertain transfer starts unticked.
  f.state.send = async () => { f.state.pending = unsent({ requestedAt: Date.now() - 61_000 }); throw new Error("lost"); };
  await s.click("Connect wallet"); await s.click("Transfer USDC");
  assert.equal(document.querySelector(".check input").checked, false);
}));

test("an uncertain transfer replaced while the box is ticked starts unticked", () => harness(async s => {
  const { UsdcFunding } = await flow("../src/flows/UsdcFunding.jsx");
  const props = { owner: WALLET, balance: 25_000_000n, remaining: 75_000_000n, canConnect: true, locale: "en", t: en => en };
  await s.render(createElement(UsdcFunding, { ...props, transfer: unsent() }));
  await s.check();
  assert.equal(document.querySelector(".check input").checked, true);
  await s.render(createElement(UsdcFunding, { ...props, transfer: unsent({ requestedAt: Date.now() - 90_000 }) }));
  assert.equal(document.querySelector(".check input").checked, false);
}));

for (const locale of ["en", "pt-BR"]) test(`a failed receipt read keeps the checkpoint and hides the RPC's words: ${locale}`, () => harness(async s => {
  const f = await fundingFixtures(locale, unsent({ hash: "0x" + "1".repeat(64), requestedAt: Date.now() - 5 * 60_000 }));
  f.state.acknowledge = async () => { throw new Error("HTTP request failed."); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.check(); await s.click(locale === "en" ? "Choose payment again" : "Escolher pagamento novamente");
  assert.match(alertText(), locale === "en" ? /couldn’t check this transfer/ : /Não foi possível conferir este envio/);
  assert.doesNotMatch(s.text(), /HTTP request/);
  assert.ok(f.state.pending);
}));

test("an unreadable Base balance keeps the manual address, its warning and the checkpoint on screen", () => harness(async s => {
  const f = await fundingFixtures();
  f.api.refreshBalance = async () => { throw new Error("Base offline"); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await untilText(s, /Base balance unavailable/);
  assert.match(s.text(), new RegExp(WALLET));
  assert.match(s.text(), /Send only native USDC on Base/);
  assert.match(s.text(), /0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/);
  assert.match(s.text(), /not a deposit address/);
  assert.equal(s.has("Copy amount"), false, "no amount without a balance");
}));

test("an unreadable Base balance still shows a pending transfer", () => harness(async s => {
  const f = await fundingFixtures();
  f.api.refreshBalance = async () => { f.state.pending = unsent(); throw new Error("Base offline"); };
  await s.render(createElement(LiveUsdcFlow, f.props));
  await untilText(s, /Transfer help/);
}));

test("Brazilian top-ups are in Portuguese, with the closed route and maintenance worded for USDC", () => harness(async s => {
  const f = await fundingFixtures("pt-BR");
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Conectar carteira");
  assert.ok(s.has("Transferir USDC"));
  assert.match(s.text(), /Envie apenas USDC nativo na rede Base/);
  f.api.adapter.getMaintenanceStatus = async () => ({ active: true });
  await s.click("Transferir USDC");
  assert.match(alertText(), /A execução está pausada/);
  assert.doesNotMatch(alertText(), /Pix/);
  f.api.adapter.getMaintenanceStatus = async () => ({ active: false });
  f.api.adapter.getAvailability = async () => ({ NVDA: { buy: false, sell: true } });
  await s.click("Transferir USDC");
  assert.match(alertText(), /Esta rota está indisponível no momento/);
  assert.equal(f.sent.length, 0);
}));

test("while the wallet picker is open the checkout steps aside, then comes back", () => harness(async s => {
  const f = await fundingFixtures();
  let cancel;
  f.props.auth.connectFundingWallet = () => new Promise((_resolve, reject) => { cancel = reject; });
  await s.render(createElement(LiveUsdcFlow, f.props));
  await s.click("Connect wallet");
  assert.equal(document.querySelector(".modal-backdrop").style.display, "none");
  await act(async () => cancel(new Error("Wallet connection cancelled")));
  assert.equal(document.querySelector(".modal-backdrop").style.display, "");
  assert.match(alertText(), /Wallet connection cancelled/);
  assert.ok(s.has("Connect wallet"));
}));

test("a suspended sheet leaves the keyboard to the window above it and takes focus back afterwards", () => harness(async s => {
  const { Modal } = await flow("../src/components/Modal.jsx");
  let closed = 0;
  const render = suspended => s.render(createElement(Modal, { title: "Checkout", suspended, onClose: () => { closed++; } }, createElement("button", null, "Inside")));
  const press = async key => { const event = new dom.window.KeyboardEvent("keydown", { key, cancelable: true }); await act(async () => { document.dispatchEvent(event); }); return event; };
  await render(false); await render(true);
  const above = document.body.appendChild(document.createElement("button"));
  above.focus();
  await press("Escape");
  assert.equal(closed, 0);
  assert.equal((await press("Tab")).defaultPrevented, false);
  assert.equal(document.activeElement, above);
  await render(false);
  assert.equal(document.activeElement, document.querySelector(".sheet"));
  await press("Escape");
  assert.equal(closed, 1);
  above.remove();
}));

for (const locale of ["en", "pt-BR"]) test(`a USDC sell review names both sides, asks for no funds and needs consent: ${locale}`, () => harness(async s => {
  const f = liveUsdcFixtures(locale), api = f.props.runtime.usdc, en = locale === "en";
  const q = await api.adapter.quoteBuy();
  api.adapter.quoteSell = async ({ tokenAmount }) => ({ ...q, direction: "SELL", tokenAmount, usdcAmount: 99.8 });
  api.adapter.registerSell = async () => { f.calls.register++; return { id: "stock-sale" }; };
  await s.render(createElement(LiveUsdcFlow, { ...f.props, direction: "SELL" }));
  await s.type("#live-usdc-amount", en ? "0.5" : "0,5");
  await s.click(en ? "Get quote" : "Ver cotação");
  const amounts = document.querySelector(".checkout-quote-amounts").textContent;
  assert.match(amounts, en ? /You sell.*NVDA.*Estimated receipt.*USDC/ : /Você vende.*NVDA.*Recebimento estimado.*USDC/);
  assert.equal(s.has(en ? "Add USDC" : "Adicionar USDC"), false);
  const confirm = en ? "Confirm and authorize" : "Confirmar e autorizar";
  await s.click(confirm);
  assert.equal(f.calls.register, 0, "disabled without consent");
  await s.check(); await s.click(confirm);
  assert.equal(f.calls.register, 1);
}));

for (const [locale, typed, sent] of [["en", "0,5", "0.5"], ["en", "0.5", "0.5"], ["pt-BR", "0.5", "0.5"], ["pt-BR", "0,5", "0.5"]]) test(`a USDC sell takes either decimal key: ${locale} ${typed}`, () => harness(async s => {
  const f = liveUsdcFixtures(locale), api = f.props.runtime.usdc, en = locale === "en", quoted = [];
  const q = await api.adapter.quoteBuy();
  api.adapter.quoteSell = async ({ tokenAmount }) => { quoted.push(tokenAmount); return { ...q, direction: "SELL", tokenAmount }; };
  await s.render(createElement(LiveUsdcFlow, { ...f.props, direction: "SELL" }));
  await s.type("#live-usdc-amount", typed);
  await s.click(en ? "Get quote" : "Ver cotação");
  assert.deepEqual(quoted, [sent]);
}));

test("a Pix sell takes the other decimal key", () => harness(async s => {
  const props = fixtures(approved), quoted = [];
  props.runtime.adapter.quoteSell = async ({ tokenAmount }) => { quoted.push(tokenAmount); return quote; };
  await s.render(createElement(SellFlow, { ...props, holdingRaw: 10n ** 18n }));
  await s.type("#sell-amount", "0.5");
  await s.type('input[placeholder^="CPF"]', "fake-test-only@example.com");
  await s.click("Continuar");
  assert.deepEqual(quoted, ["0.5"]);
}));

for (const [locale, direction, hint] of [
  ["en", "BUY", /such as 1,000\.50/], ["en", "SELL", /such as 0\.5/], ["pt-BR", "BUY", /como 1\.000,50/], ["pt-BR", "SELL", /como 0,5/],
]) test(`an amount the checkout cannot read is explained, not just refused: ${locale} ${direction}`, () => harness(async s => {
  const f = liveUsdcFixtures(locale);
  await s.render(createElement(LiveUsdcFlow, { ...f.props, direction }));
  assert.doesNotMatch(s.text(), hint, "a readable amount");
  await s.type("#live-usdc-amount", "1,00,000");
  assert.match(s.text(), hint);
  await s.type("#live-usdc-amount", "");
  assert.doesNotMatch(s.text(), hint, "an empty field");
}));
