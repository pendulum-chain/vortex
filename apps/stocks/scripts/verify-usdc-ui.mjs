// Local no-money browser acceptance checks. Real trading, wallet funding and price APIs are blocked.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.env.STOCKS_PREVIEW_ORIGIN || "http://127.0.0.1:5176";
const output = process.env.STOCKS_QA_OUTPUT || "/tmp/stocks-usdc-ui-qa";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
try {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]) {
    const page = await browser.newPage({ viewport, reducedMotion:"reduce" });
    const errors = [], forbidden = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route(/\/api\/(production|staging)|api\.vortexfinance|api\.relay\.link|api\.coingecko\.com|economia\.awesomeapi/, async r => { forbidden.push(r.request().url()); await r.abort(); });
    await page.goto(`${origin}/en/stocks/#/acao/AAPL`, { waitUntil: "networkidle" });
    const skip = page.getByRole("button", { name: "Skip to content" });
    await skip.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "conteudo");
    assert.equal(new URL(page.url()).hash, "#/acao/AAPL");
    const amount = page.getByRole("textbox", { name: "Your investment amount" });
    await amount.fill("10,000");
    await page.getByRole("button", { name: "See purchase costs" }).click();
    assert.match(await page.locator(".fee-card .breakdown dd").first().innerText(), /10,000.00 USDC/);
    await page.locator(".preview-result").screenshot({ path: `${output}/grouped-estimate-${viewport.width}.png` });
    await page.goto(`${origin}/en/stocks/`,{waitUntil:"networkidle"});
    await page.getByRole("heading", {name:/fair fees/, level:1}).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"),"en");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),"English landing overflow");
    await page.screenshot({path:`${output}/english-landing-${viewport.width}.png`,fullPage:true});
    const preview = page.getByRole("region", {name:"Prepare your purchase"});
    await preview.getByRole("button", {name:"See purchase costs",exact:true}).click();
    await preview.getByText("Your estimate", {exact:true}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Continue with Google"}).count(),0,"Preview does not require login");
    await preview.getByRole("button", {name:"Continue with USDC",exact:true}).click();
    await page.getByRole("button",{name:"Continue with Google"}).click();
    await page.getByRole("button",{name:"Continue to USDC payment"}).waitFor();
    await page.locator(".sheet .fee-summary summary").click();
    assert.ok(await page.evaluate(() => document.querySelector(".sheet").scrollWidth <= document.querySelector(".sheet").clientWidth + 1), "USDC quote overflows viewport");
    for(const id of ["swap","bridge","network","vortex"]) assert.equal(await page.locator(`.sheet .fee-summary [data-cost-id="${id}"]`).count(),1,`${id} cost shown once`);
    assert.equal(await page.locator(".sheet .reserve-balance").count(),1,"ETH reserve shown apart from the fees");
    await page.locator(".sheet .fee-summary").getByText(/adds no extra fee/).waitFor();
    assert.equal(await page.getByRole("button",{name:"Continue to USDC payment"}).isEnabled(),false);
    await page.screenshot({path:`${output}/usdc-quote-${viewport.width}.png`});
    await page.locator(".sheet .fee-summary summary").click();
    await page.getByRole("checkbox",{name:/I approve this amount/}).check();
    await page.getByRole("button",{name:"Continue to USDC payment"}).click();
    await page.getByRole("img",{name:"Simulation: no USDC payment address"}).waitFor();
    assert.equal(await page.getByRole("button",{name:/Copy.*address/i}).count(),0);
    await page.getByRole("button",{name:"Simulate partial payment"}).click();
    await page.getByText("50.000000 USDC",{exact:true}).waitFor();
    await page.screenshot({path:`${output}/usdc-partial-payment-${viewport.width}.png`});
    await page.reload({waitUntil:"networkidle"});
    await page.getByRole("button",{name:"Resume order",exact:true}).click();
    await page.getByText("50.000000 USDC",{exact:true}).waitFor();
    // The same pending order also wins over a new Pix request after switching to Brazil.
    await page.goto(`${origin}/pt-br/stocks/#/acao/SPY?demoFlow=buy`,{waitUntil:"networkidle"});
    await page.getByRole("heading",{name:"Buy NVDA with USDC",exact:true}).waitFor();
    await page.getByText("50.000000 USDC",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Simulate incoming USDC",exact:true}).click();
    await page.getByRole("heading",{name:"Your NVDA Stock Tokens have arrived",exact:true}).waitFor({timeout:15000});
    await page.getByRole("button",{name:"Done",exact:true}).click();
    await page.goto(`${origin}/en/stocks/`,{waitUntil:"networkidle"});
    const row = page.locator(".international-holdings > div").filter({hasText:"NVDA"});
    await row.getByRole("button",{name:"Sell for USDC"}).click();
    await page.getByRole("button",{name:"Get quote",exact:true}).click();
    await page.getByRole("checkbox",{name:/I approve this amount/}).check();
    await page.getByRole("button",{name:"Confirm sale to USDC"}).click();
    await page.getByRole("heading",{name:"Your USDC is available on Base",exact:true}).waitFor({timeout:15000});
    await page.screenshot({path:`${output}/usdc-sale-complete-${viewport.width}.png`});
    await page.getByRole("button",{name:"Done",exact:true}).click();
    // A second purchase consumes existing USDC instead of asking for another transfer.
    await preview.getByLabel("Your investment amount").fill("10");
    await preview.getByRole("button",{name:"See purchase costs",exact:true}).click();
    await preview.getByRole("button",{name:"Continue with USDC",exact:true}).click();
    await page.getByRole("button",{name:"Buy with USDC balance"}).waitFor();
    await page.getByRole("checkbox",{name:/I approve this amount/}).check();
    await page.getByRole("button",{name:"Buy with USDC balance"}).click();
    await page.getByRole("heading",{name:"Your NVDA Stock Tokens have arrived",exact:true}).waitFor({timeout:15000});
    assert.ok(await page.evaluate(() => document.querySelector(".sheet").scrollWidth <= document.querySelector(".sheet").clientWidth+1),"USDC modal overflow");
    await page.getByRole("button",{name:"Done",exact:true}).click();
    // Brazil keeps Pix and exposes USDC as an explicit second method.
    await page.goto(`${origin}/pt-br/stocks/#/acao/NVDA?demoFlow=buy`,{waitUntil:"networkidle"});
    await page.getByRole("group",{name:"Forma de pagamento"}).waitFor();
    await page.getByText("Pix · Brasil",{exact:true}).waitFor();
    await page.getByRole("button",{name:/USDC · Base/}).click();
    await page.getByRole("heading",{name:"Buy NVDA with USDC",exact:true}).waitFor();
    assert.deepEqual(errors,[],"Browser runtime errors");
    assert.deepEqual(forbidden,[],"Demo made a real API call");
    report.push({viewport,englishUi:"PASS",costsAndZeroMarkup:"PASS",partialPayment:"PASS",reloadRecovery:"PASS",crossPaymentLock:"PASS",buy:"PASS",sellToBaseUsdc:"PASS",existingBalance:"PASS",brazilPixAndUsdc:"PASS",noRealCalls:"PASS",runtimeErrors:errors});
    console.log(`PASS ${viewport.width}px: English USDC buy, partial payment, resume, Pix lock, USDC sell and balance reuse`);
    await page.close();
  }
} finally {
  writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
