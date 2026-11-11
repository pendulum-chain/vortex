// Local demo smoke test. Real ramp endpoints are blocked and their use fails this test.
// Uses the monorepo's existing Playwright dependency and locally installed Chrome.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.STOCKS_PREVIEW_URL || "http://127.0.0.1:5175/pt-br/stocks/";
const output = process.env.STOCKS_QA_OUTPUT || "/tmp/vortex-stocks-ui-qa";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [], forbidden = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/\/api\/(production|staging)|api\.vortexfinance|api\.relay\.link/, async (route) => { forbidden.push(route.request().url()); await route.abort(); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.match(await page.title(), /fatia/i);
    await page.getByText("Ambiente de teste.", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Landing overflows viewport");
    await page.screenshot({ path: `${output}/landing-${viewport.width}.png`, fullPage: true });
    const preview = page.getByRole("region", { name: "Simule sua compra" });
    await preview.getByRole("button", { name: "Simular compra", exact: true }).click();
    await preview.getByText("Sua estimativa", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Continuar com Google" }).count(), 0, "Preview works without login");
    await preview.getByRole("button", { name: "Continuar com Pix", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/public-preview-${viewport.width}.png` });
    await page.goto(`${url}#/acao/NVDA?demoFlow=buy-quote`, { waitUntil: "networkidle" });
    const generate = page.getByRole("button", { name: /Gerar Pix de/ });
    await generate.waitFor({ timeout: 20_000 });
    const costs = page.locator(".provider-costs");
    assert.equal(await costs.getAttribute("open"), null, "Cost details are available without crowding the review");
    await costs.locator("summary").click();
    await costs.getByText("Rota direta · Relay + Uniswap", { exact: true }).waitFor();
    for (const provider of ["Avenia", "Nabla", "Relay", "Uniswap", "Vortex", "Redes"]) {
      assert.equal(await costs.getByText(provider, { exact: true }).count(), 1, `${provider} provider shown`);
    }
    const ownFee = costs.locator('[data-cost-id="product"]');
    assert.match(await ownFee.innerText(), /0,00/);
    assert.match(await ownFee.innerText(), /0 bps/);
    assert.ok(await page.evaluate(() => document.querySelector(".sheet").scrollWidth <= document.querySelector(".sheet").clientWidth + 1), "Quote detail overflows its modal");
    await page.evaluate(() => { document.querySelector(".sheet").scrollTop = 0; });
    await page.screenshot({ path: `${output}/buy-providers-${viewport.width}.png` });
    await costs.locator("summary").click();
    assert.equal(await generate.isEnabled(), false, "Purchase requires explicit confirmation");
    await page.getByRole("checkbox", { name: /Entendo que é um Stock Token/ }).check();
    await page.screenshot({ path: `${output}/buy-review-${viewport.width}.png`, fullPage: true });
    await generate.click();
    await page.getByRole("img", { name: "Simulação: sem código Pix" }).waitFor();
    assert.equal(await page.getByText("Pix copia e cola", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Já fiz o Pix (simulado)" }).click();
    await page.getByRole("heading", { name: "Compra concluída" }).waitFor({ timeout: 45_000 });
    await page.screenshot({ path: `${output}/buy-success-${viewport.width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Buy flow overflows viewport");
    await page.goto(`${url}#/historico`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Histórico", exact: true }).waitFor();
    await page.locator(".activity-row").filter({ hasText: /Compra · NVDA/ }).first().waitFor();
    await page.goto(`${url}#/acao/NVDA?demoFlow=sell-reserve-used`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Confirmar venda", exact: true }).waitFor();
    const sellCosts = page.locator(".provider-costs");
    await sellCosts.locator("summary").click();
    assert.match(await sellCosts.locator("dl > div").first().innerText(), /Uniswap/);
    assert.match(await sellCosts.locator('[data-cost-id="product"]').innerText(), /0 bps/);
    await page.evaluate(() => { document.querySelector(".sheet").scrollTop = 0; });
    await page.screenshot({ path: `${output}/sell-providers-${viewport.width}.png` });
    assert.deepEqual(errors, [], "Runtime errors");
    assert.deepEqual(forbidden, [], "A demo must never call real trading endpoints");
    report.push({ viewport, landing: "PASS", buyReview: "PASS", directProviderCosts: "PASS", sellProviderCosts: "PASS", zeroProductFee: "PASS", simulatedPurchase: "PASS", history: "PASS", noRealPaymentCode: "PASS", noRealRampCalls: "PASS", overflow: false, runtimeErrors: errors });
    console.log(`PASS ${viewport.width}px: landing → NVDA review → simulated Pix → purchase success`);
    await page.close();
  }
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
