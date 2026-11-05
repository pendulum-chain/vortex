// Dev-server component acceptance checks with fake KYC/Privy only; no credentials or payments.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const origin = process.env.STOCKS_PREVIEW_ORIGIN || "http://127.0.0.1:5176";
const output = process.env.STOCKS_QA_OUTPUT || "/tmp/stocks-review-ui-qa";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], forbidden = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route(/\/api\/(production|staging)|api\.vortexfinance|api\.coingecko\.com|economia\.awesomeapi/, async r => { forbidden.push(r.request().url()); await r.abort(); });
  await page.goto(`${origin}/pt-br/stocks/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const reactModule = await import("/pt-br/stocks/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const domModule = await import("/pt-br/stocks/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = domModule.default ?? domModule;
    const { KycStep } = await import("/pt-br/stocks/src/flows/parts.jsx");
    document.getElementById("root").style.display = "none";
    const target = document.createElement("main"); target.style.padding = "20px"; document.body.append(target);
    window.review = { React, createRoot, KycStep, target, root: null, calls: [] };
    window.mountKyc = (scenario, demo = true) => {
      const r = window.review; r.root?.unmount(); r.root = createRoot(r.target); r.calls = []; r.approved = 0; r.scenario = scenario;
      let attempts = 0;
      const kyc = { demo,
        createSubaccount: async () => { r.calls.push("create"); if (scenario === "close-prepare") await new Promise(resolve => { r.release = resolve; }); return { subAccountId: "fake-subaccount" }; },
        getUploadUrls: async () => { r.calls.push("uploads"); return { idUpload: { id: "fake-doc" }, selfieUpload: { id: "fake-selfie", livenessUrl: "https://example.com/fake-selfie" } }; },
        uploadDocument: async () => r.calls.push("upload"), submit: async () => r.calls.push("submit"),
        poll: async () => { r.calls.push("poll"); if (++attempts === 1) return scenario === "expired" ? { status: "EXPIRED" } : { status: "COMPLETED", result: "REJECTED", failureReason: "tax_id" }; return { status: "COMPLETED", result: "APPROVED" }; },
      };
      r.root.render(r.React.createElement(r.KycStep, { kyc, email: "test@example.com", onApproved: () => r.approved++ }));
    };
  });
  for (const outcome of ["expired", "rejected"]) {
    await page.evaluate(scenario => window.mountKyc(scenario), outcome);
    await page.getByRole("button", { name: "Continuar para a selfie" }).click();
    await page.getByRole("button", { name: "Simular selfie concluída" }).click();
    await page.getByRole("button", { name: "Continuar para a selfie" }).waitFor();
    assert.match(await page.getByRole("alert").innerText(), outcome === "expired" ? /prazo.*terminou/ : /CPF informado não foi encontrado/);
    await page.getByRole("button", { name: "Continuar para a selfie" }).click();
    await page.getByRole("button", { name: "Simular selfie concluída" }).click();
    await page.waitForFunction(() => window.review.approved === 1);
    assert.equal(await page.evaluate(() => window.review.calls.filter(x => x === "submit").length), 2);
    assert.equal(await page.evaluate(() => window.review.calls.filter(x => x === "uploads").length), 2);
    report.push(`${outcome}: new upload/selfie/submission, then approved`);
  }
  await page.evaluate(() => window.mountKyc("close-prepare"));
  await page.getByRole("button", { name: "Continuar para a selfie" }).click();
  await page.waitForFunction(() => typeof window.review.release === "function");
  await page.evaluate(async () => { window.review.root.unmount(); window.review.release(); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(await page.evaluate(() => window.review.calls), ["create"]);
  report.push("close while preparing: no later upload, navigation or approval");
  await page.evaluate(() => window.mountKyc("cpf", false));
  const cpf = page.getByPlaceholder("000.000.000-00");
  await cpf.fill("12345678901"); assert.equal(await cpf.getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#kyc-cpf-error").count(), 1);
  await cpf.fill("00000000191"); assert.equal(await cpf.getAttribute("aria-invalid"), "false");
  await page.screenshot({ path: `${output}/kyc-mobile.png`, fullPage: true });
  report.push("CPF checksum: invalid input labelled, valid formatted input accepted");

  // Test the actual lazy bridge with the SDK's documented initialization-error surface.
  await page.route(/\/node_modules\/\.vite\/deps\/@privy-io_react-auth\.js/, r => r.fulfill({ contentType: "application/javascript", body: `export const PrivyProvider=({children})=>children; export const usePrivy=()=>({ready:false,authenticated:false,user:null,error:new Error('fake init failure'),login:()=>{},logout:()=>{}}); export const useWallets=()=>({wallets:[]}); export const useIdentityToken=()=>({identityToken:null});` }));
  await page.evaluate(async (modulePath) => {
    const { ConsumerPrivyProvider } = await import(modulePath);
    const r = window.review; r.root.unmount(); r.root = r.createRoot(r.target);
    r.root.render(r.React.createElement(ConsumerPrivyProvider, { appId: "fake", config: {}, session: { clear() {} }, onAuthChange: auth => { window.bridgeAuth = auth; } }));
  }, `/pt-br/stocks/@fs${fileURLToPath(new URL("../../../packages/consumer-kit/src/privy/ConsumerPrivyProvider.jsx", import.meta.url))}`);
  await page.waitForFunction(() => window.bridgeAuth?.status === "error");
  assert.equal(await page.evaluate(() => window.bridgeAuth.error), "AUTH_INITIALIZATION_FAILED");
  report.push("Privy initialization failure exposed by actual bridge");

  // Real payment UI with an obviously nonpayable fixture; all status and confirmation calls fake.
  await page.evaluate(async () => {
    const { PixStep } = await import("/pt-br/stocks/src/flows/PixStep.jsx");
    window.mountPix = (scenario = "clear") => {
      const r = window.review; r.root.unmount(); r.root = r.createRoot(r.target);
      r.pix = { status: { active: false, details: null }, fail: scenario === "unknown", reads: 0, confirmations: 0 };
      const adapter = { enabled: scenario !== "disabled", getMaintenanceStatus: async () => {
        r.pix.reads++; if (r.pix.fail) throw new Error("fake unavailable status");
        if (r.pix.holdNext) { r.pix.holdNext = false; return new Promise(resolve => { r.pix.release = resolve; }); }
        return r.pix.status;
      } };
      const ramp = { id: "review-fake-pix", brlAmount: "500", startDeadline: Date.now() + (scenario === "expired" ? -60_000 : 15 * 60_000), depositQrCode: "REVIEW FIXTURE ONLY - NOT A PAYABLE PIX CODE" };
      r.root.render(r.React.createElement(PixStep, { ramp, adapter, tokenLabel: "NVDA", onPaid: () => r.pix.confirmations++ }));
    };
    window.mountPix();
  });
  await page.locator(".pix .copy-code").waitFor();
  const confirmPix = page.getByRole("button", { name: "Já fiz o Pix", exact: true });
  assert.equal(await confirmPix.isEnabled(), true);
  await page.evaluate(() => { window.review.pix.status = { active: true, details: { end_datetime: new Date(Date.now() + 60 * 60_000).toISOString() } }; window.dispatchEvent(new Event("focus")); });
  await page.waitForFunction(() => !document.querySelector(".pix .copy-code") && document.querySelector(".pix .btn--primary")?.disabled);
  assert.equal(await page.locator(".pix .qr").count(), 0);
  await page.getByText(/A Vortex está em manutenção/).waitFor();
  await page.screenshot({ path: `${output}/pix-maintenance-mobile.png`, fullPage: true });
  await page.evaluate(() => { window.review.pix.status = { active: false, details: null }; window.dispatchEvent(new Event("focus")); });
  await page.locator(".pix .copy-code").waitFor();
  assert.equal(await confirmPix.isEnabled(), true); await confirmPix.click();
  assert.equal(await page.evaluate(() => window.review.pix.confirmations), 1);
  report.push("maintenance on bank return hides Pix QR/copy and disables payment; clear status re-enables the same order");
  await page.evaluate(() => { window.review.pix.holdNext = true; window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); });
  await page.waitForFunction(() => typeof window.review.pix.release === "function" && !document.querySelector(".pix .copy-code") && document.querySelector(".pix .btn--primary")?.disabled);
  assert.equal(await page.locator(".pix .qr").count(), 0);
  await page.evaluate(() => window.review.pix.release({ active: true, details: { end_datetime: new Date(Date.now() + 60 * 60_000).toISOString() } }));
  await page.getByText(/A Vortex está em manutenção/).waitFor();
  report.push("bank return invalidates prior clear status immediately while a delayed status read is pending");
  for (const scenario of ["unknown", "disabled", "expired"]) {
    await page.evaluate(name => window.mountPix(name), scenario);
    await page.getByText(scenario === "expired" ? /O prazo deste Pix terminou/ : scenario === "disabled" ? /Novos pagamentos estão pausados/ : /Aguarde enquanto verificamos/).waitFor();
    assert.equal(await page.locator(".pix .copy-code").count(), 0);
    assert.equal(await page.locator(".pix .qr").count(), 0);
    assert.equal(await confirmPix.isEnabled(), false);
    if (scenario === "disabled") assert.equal(await page.evaluate(() => window.review.pix.reads), 0);
  }
  report.push("unavailable status, disabled route and expired Pix never expose payment instructions");

  // Two actual browser tabs, shared durable checkpoint, entirely fake wallet/receipt transport.
  const second = await page.context().newPage();
  await second.goto(`${origin}/pt-br/stocks/`, { waitUntil: "networkidle" });
  const walletModule = `/pt-br/stocks/@fs${fileURLToPath(new URL("../../../packages/consumer-kit/src/evm-wallet.js", import.meta.url))}`;
  const chainModule = `/pt-br/stocks/@fs${fileURLToPath(new URL("../../../packages/consumer-kit/src/chains.js", import.meta.url))}`;
  const stateKey = "stocks-review-fake-wallet-only";
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ broadcasts: 0 })), stateKey);
  const sendFake = async ({ walletModule, chainModule, stateKey }) => {
    const { submitWalletTransactions } = await import(walletModule), { robinhoodChain } = await import(chainModule);
    const from = "0x0000000000000000000000000000000000000001", token = "0x0000000000000000000000000000000000000002", recipient = "0x0000000000000000000000000000000000000003";
    const read = () => JSON.parse(localStorage.getItem(stateKey));
    const tx = { phase: "transfer", signer: from, network: "robinhood", txData: { to: token, data: `0xa9059cbb${recipient.slice(2).padStart(64, "0")}${"a".padStart(64, "0")}`, gas: "21000" } };
    await submitWalletTransactions({ client: { submitUserTransactions: async (_, txs, callbacks) => callbacks.sendTransaction(txs[0].txData, { unsignedTransaction: txs[0] }) }, rampId: "fake-cross-tab", transactions: [tx], from, chain: robinhoodChain,
      expect: { token, maxAmountWei: "10", spenders: [recipient], network: "robinhood", phases: { transfer: ["transfer"] } },
      provider: { request: async ({ method }) => { await new Promise(r => setTimeout(r, 10)); if (method === "eth_getBalance") return "0xffffffffffffffff"; if (method === "eth_gasPrice") return "0x1"; if (method === "eth_sendTransaction") { const state = read(); state.broadcasts++; localStorage.setItem(stateKey, JSON.stringify(state)); return `0x${"ab".repeat(32)}`; } } },
      publicClient: { waitForTransactionReceipt: async () => ({ status: "success" }) }, getCheckpoint: () => read().checkpoint,
      saveCheckpoint: (_, __, value) => localStorage.setItem(stateKey, JSON.stringify({ ...read(), checkpoint: value })),
    });
  };
  const fakeArgs = { walletModule, chainModule, stateKey };
  await Promise.all([page.evaluate(sendFake, fakeArgs), second.evaluate(sendFake, fakeArgs)]);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).broadcasts, stateKey), 1);
  await second.close();
  report.push("two tabs resume one phase: exactly one fake broadcast, second reuses checkpoint");
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ report, errors, blockedRequests: forbidden.length }, null, 2));
  console.log(JSON.stringify({ checks: report.length, output }));
} finally { await browser.close(); }
