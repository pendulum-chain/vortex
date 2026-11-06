// The ETH gas reserve delivered with a purchase: parsing the quote fields,
// the fee checks, and the pt-BR copy of the buy review and the sell review.
import assert from "node:assert/strict";
import test from "node:test";
import {
  GAS_RESERVE_LABEL_PT, GAS_RESERVE_MAX_WEI, SELL_GAS_LIMIT, formatEthPt, gasReserveFeeProblem, gasReserveLinePt, gasReserveNotePt,
  gasShortfallPt, networkFeeWithoutReserve, parseGasReserve, sellGasNoticePt, sellGasRequiredWei, sellLaterNotePt,
} from "../src/lib/gas-reserve.js";
import { sourceFiles } from "./helpers.mjs";

// The flows have no DOM renderer here: source checks that they render these helpers.
const flowStep = (path, from) => {
  const text = sourceFiles().find((file) => file.path === path).text;
  return text.slice(text.indexOf(from), text.indexOf("export default"));
};

// Example conversion: 0.00005 ETH = R$ 0.71 at US$ 2,716.75 and 5.2165 BRL/USD (2026-09-29).
const FIELDS = { gasReserveAmount: "0.00005", gasReserveCurrency: "ETH", gasReserveFiat: "0.71", gasReserveUsd: "0.135838" };
const RESERVE = { amount: "0.00005", amountWei: "50000000000000", currency: "ETH", brl: 0.71, usd: 0.135838 };
const QUOTE = { inputAmount: "100.00", networkFeeFiat: "0.84", processingFeeFiat: "1.10", partnerFeeFiat: "0.00", totalFeeFiat: "1.94", networkFeeUsd: "0.161028" };

test("no reserve: the fields absent, empty or zero (a funded wallet, target 0)", () => {
  assert.equal(parseGasReserve({}), null);
  assert.equal(parseGasReserve(null), null);
  assert.equal(parseGasReserve({ gasReserveAmount: "", gasReserveFiat: null }), null);
  assert.equal(parseGasReserve({ gasReserveAmount: "0" }), null);
  assert.equal(parseGasReserve({ gasReserveAmount: "0", gasReserveCurrency: "ETH", gasReserveFiat: "0.00", gasReserveUsd: "0" }), null);
  assert.equal(parseGasReserve({ gasReserveCurrency: "ETH" }), null, "a currency label alone charges nothing");
});

test("a reserve is read exactly, in wei, with its BRL (and USD) value", () => {
  assert.deepEqual({ ...parseGasReserve(FIELDS) }, RESERVE);
  assert.ok(Object.isFrozen(parseGasReserve(FIELDS)));
  assert.equal(parseGasReserve({ ...FIELDS, gasReserveAmount: "0.000050" }).amount, "0.00005", "canonical decimal");
  assert.equal(parseGasReserve({ ...FIELDS, gasReserveAmount: 0.00004 }).amountWei, "40000000000000", "a JSON number in plain notation");
  assert.equal(parseGasReserve({ ...FIELDS, gasReserveUsd: undefined }).usd, null, "USD is optional");
  assert.equal(parseGasReserve({ ...FIELDS, gasReserveAmount: "0.0003" }).amountWei, GAS_RESERVE_MAX_WEI.toString(), "the bound itself is allowed");
});

test("a malformed reserve fails closed", () => {
  const bad = (overrides, why) => assert.throws(() => parseGasReserve({ ...FIELDS, ...overrides }), Error, why);
  bad({ gasReserveAmount: "-0.00005" }, "negative");
  bad({ gasReserveAmount: "5e-5" }, "exponent");
  bad({ gasReserveAmount: 5e-7 }, "a JSON number that stringifies with an exponent");
  bad({ gasReserveAmount: "0.0000500000000000001" }, "more than 18 decimals");
  bad({ gasReserveAmount: "0.00030000001" }, "above the bound");
  bad({ gasReserveAmount: "1" }, "a whole ETH");
  bad({ gasReserveAmount: "0,00005" }, "a comma");
  bad({ gasReserveCurrency: "USDG" }, "not ETH");
  bad({ gasReserveCurrency: "eth" }, "exactly ETH");
  bad({ gasReserveCurrency: undefined }, "currency missing");
  bad({ gasReserveFiat: undefined }, "a delivery without its price");
  bad({ gasReserveFiat: "-0.71" }, "negative BRL");
  bad({ gasReserveFiat: "abc" }, "not a number");
  bad({ gasReserveUsd: "-1" }, "negative USD");
  bad({ gasReserveAmount: "0" }, "charged without ETH");
});

test("the reserve must sit inside the network and total fees, and below the amount paid", () => {
  assert.equal(gasReserveFeeProblem(QUOTE, RESERVE), null);
  assert.equal(gasReserveFeeProblem({ ...QUOTE, networkFeeFiat: "0.70", totalFeeFiat: "1.80" }, RESERVE), null, "one cent of rounding");
  assert.match(gasReserveFeeProblem({ ...QUOTE, networkFeeFiat: "0.13", totalFeeFiat: "1.23" }, RESERVE), /networkFeeFiat/, "reserve left out of the network fee");
  assert.match(gasReserveFeeProblem({ ...QUOTE, totalFeeFiat: "1.23" }, RESERVE), /totalFeeFiat/, "reserve left out of the total");
  // The reserve counted in the total but not in the network fee, while the network fee alone is at
  // least the reserve: the network line would read 0.84 - 0.71 = 0.13 instead of 0.84.
  assert.match(gasReserveFeeProblem({ ...QUOTE, totalFeeFiat: "2.65" }, RESERVE), /more than processing \+ partner \+ network/, "reserve outside networkFeeFiat");
  assert.equal(gasReserveFeeProblem({ ...QUOTE, totalFeeFiat: "1.95" }, RESERVE), null, "one cent of rounding either way");
  assert.match(gasReserveFeeProblem({ ...QUOTE, totalFeeFiat: "1.96" }, RESERVE), /more than/);
  // The API's own shape: unrounded components, total rounded to cents (fees.ts l.93-94).
  assert.equal(gasReserveFeeProblem({ ...QUOTE, networkFeeFiat: "0.8486", processingFeeFiat: "1.1034", totalFeeFiat: "1.95" }, RESERVE), null);
  assert.match(gasReserveFeeProblem({ ...QUOTE, inputAmount: "1.94" }, RESERVE), /below the amount paid/);
  assert.match(gasReserveFeeProblem({ ...QUOTE, networkFeeUsd: "0.02" }, RESERVE), /networkFeeUsd/);
  assert.equal(gasReserveFeeProblem({ ...QUOTE, networkFeeUsd: undefined }, RESERVE), null, "USD checked only when both are sent");
});

test("the network line excludes the reserve, which gets its own line", () => {
  assert.equal(networkFeeWithoutReserve("0.84", RESERVE), 0.13);
  assert.equal(networkFeeWithoutReserve("1.01", RESERVE), 0.3);
  assert.equal(networkFeeWithoutReserve("0.70", RESERVE), 0, "never negative");
  assert.equal(networkFeeWithoutReserve("0.30", null), 0.3, "unchanged without a reserve");
});

test("buy review: the selling-later note says what the reserve is, and never that it pays for a sell", () => {
  const withReserve = sellLaterNotePt({ gasReserve: RESERVE });
  assert.match(withReserve, /A reserva fica na sua carteira como ETH na Robinhood Chain/);
  assert.match(withReserve, /A taxa de rede de cada venda aparece antes de você confirmar/);
  assert.doesNotMatch(withReserve, /paga a taxa/, "a permit sell does not spend it");
  const without = sellLaterNotePt({ gasReserve: null });
  assert.match(without, /Vender depois tem novas taxas/);
  assert.doesNotMatch(without, /reserva|não precisa/);
  assert.match(flowStep("src/flows/BuyFlow.jsx", "function ConfirmStep"), /<p className="hint">\{sellLaterNotePt\(quote\)\}<\/p>/);
});

test("sell review: the fee is paid from the reserve; an empty wallet gets the honest fallback", () => {
  assert.equal(sellGasNoticePt({ gasless: true, ethWei: 0n }), null, "permit sell: no ETH involved");
  const empty = sellGasNoticePt({ gasless: false, ethWei: 0n });
  assert.equal(empty.needsEth, true);
  assert.equal(empty.tone, "warning");
  assert.equal(empty.title, "Falta ETH para a taxa de rede");
  assert.match(empty.text, /reserva que vem com a compra já não está nesta carteira/);
  assert.match(empty.text, /somente pela rede Robinhood Chain/);
  assert.match(empty.text, /nova compra: ela repõe a reserva/);
  assert.equal(sellGasNoticePt({ ethWei: "0" }).needsEth, true);
  for (const ethWei of [10_000_000_000_000n, 1n, null, undefined]) {
    const notice = sellGasNoticePt({ gasless: false, ethWei });
    assert.equal(notice.needsEth, false, String(ethWei));
    assert.equal(notice.tone, "neutral");
    assert.match(notice.text, /reserva/);
  }
  for (const notice of [empty, sellGasNoticePt({ ethWei: 1n })]) assert.doesNotMatch(notice.text, /US\$ 0,05/, "do not present a fixed network fee");
});

test("what a wallet must hold to confirm a one-transfer sell: its gas limit x 1.2 x the base fee", () => {
  assert.equal(SELL_GAS_LIMIT, 85_000n, "the 77,118 estimate plus at most 10 %, as Vortex is asked to send it");
  assert.equal(sellGasRequiredWei(20_000_000n), 2_040_000_000_000n, "the 0.02 gwei floor: 102,000 gas x base fee");
  assert.equal(sellGasRequiredWei("470000000"), 47_940_000_000_000n, "the 30-day p95, 0.47 gwei: 4.8 x 10^-5 ETH");
  for (const unknown of [null, undefined, "", "gwei"]) assert.equal(sellGasRequiredWei(unknown), null, String(unknown));
});

test("sell review: dust or a higher fee blocks too, before anything is registered", () => {
  const required = sellGasRequiredWei(20_000_000n);
  const dust = sellGasNoticePt({ gasless: false, ethWei: 1_000_000_000_000n, requiredWei: required });
  assert.equal(dust.needsEth, true);
  assert.equal(dust.tone, "warning");
  assert.equal(dust.title, "Falta ETH para a taxa de rede");
  assert.match(dust.text, /precisa de ≈ 0,0000021 ETH na Robinhood Chain para a taxa de rede e tem ≈ 0,000001 ETH/);
  assert.match(dust.text, /a reserva que vem com a compra está no fim ou a taxa de rede subiu/, "neither cause is claimed alone");
  assert.match(dust.text, /Comprar de novo repõe a reserva quando ela está baixa/, "nothing is registered yet, so a new purchase is possible");
  assert.match(dust.text, /enviar um pouco de ETH para o endereço abaixo, somente pela rede Robinhood Chain/);
  assert.equal(sellGasNoticePt({ ethWei: required, requiredWei: required }).needsEth, false, "exactly enough");
  assert.equal(sellGasNoticePt({ ethWei: required - 1n, requiredWei: String(required) }).needsEth, true);
  assert.equal(sellGasNoticePt({ gasless: true, ethWei: 1n, requiredWei: required }), null, "permit sell: no ETH involved");
  assert.equal(sellGasNoticePt({ ethWei: 1n, requiredWei: null }).needsEth, false, "an unknown fee leaves it to the check before registering");
  assert.equal(sellGasNoticePt({ ethWei: null, requiredWei: required }).needsEth, false, "an unknown balance too");
});

test("the sell review renders the gas notice and blocks a wallet that cannot pay this sell", () => {
  const review = flowStep("src/flows/SellFlow.jsx", "function ReviewStep");
  assert.match(review, /sellGasNoticePt\(\{ gasless: quote\.gasless, ethWei, requiredWei \}\)/);
  assert.match(review, /const canConfirm = accepted && !blocked && !noGas/);
  assert.match(review, /\{noGas && <WalletAddress address=\{address\} \/>\}/);
  assert.doesNotMatch(review, /US\$ 0,05/);
  const flow = sourceFiles().find((file) => file.path === "src/flows/SellFlow.jsx").text;
  assert.match(flow, /runtime\.readGasPrice\(\)/, "the review knows the base fee");
  assert.match(flow, /setRequiredWei\(sellGasRequiredWei\(gasPriceWei\)\)/);
  assert.match(flow, /nextError\?\.code === "INSUFFICIENT_GAS" && nextError\.details\) \{[^}]*setEthWei\(nextError\.details\.balanceWei\); setRequiredWei\(nextError\.details\.requiredWei\);/, "a refusal before registering updates the card");
});

test("after INSUFFICIENT_GAS at signing, the sign step shows the wallet address to send ETH to", () => {
  const flow = sourceFiles().find((file) => file.path === "src/flows/SellFlow.jsx").text;
  const sign = flow.slice(flow.indexOf('{step === "sign" && ('), flow.indexOf('{step === "processing" && ('));
  assert.match(sign, /\{error && <p className="field-error" role="alert">\{error\}<\/p>\}\s*\{errorCode === "INSUFFICIENT_GAS" && <WalletAddress address=\{wallet\} \/>\}/);
  assert.match(flow, /setErrorCode\(nextError\?\.code \|\| ""\)/);
});

test("the wallet address box shrinks to the flow instead of widening it (390 px)", () => {
  // A grid item's automatic minimum width is its min-content: the unbroken address (or a Pix
  // copia-e-cola code) widened .flow-section's column to 437 px and the sheet scrolled sideways.
  const css = sourceFiles().find((file) => file.path === "src/styles.css").text;
  assert.match(css, /\.flow-section \{ display: grid;/);
  assert.match(css, /\.copy-code \{[^}]*\bmin-width: 0;/);
  assert.match(css, /\.copy-code b \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  // The wallet address to send ETH to is shown whole (wrapped), so it can be checked; a Pix code stays one line.
  assert.match(css, /\.copy-code--wrap b \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  const flow = sourceFiles().find((file) => file.path === "src/flows/SellFlow.jsx").text;
  assert.match(flow, /<button className="copy-code copy-code--wrap" type="button" onClick=\{\(\) => copy\(address, "wallet"\)\}>/);
});

test("a shortfall never reads as if the balance were enough: the need rounds up, the balance down", () => {
  // At the floor one sell needs 0.00000204 ETH; 0.000002 ETH is short, yet both read "≈ 0,000002" at two
  // significant digits, and the card said the wallet needs ≈ 0,000002 and has ≈ 0,000002.
  const required = sellGasRequiredWei(20_000_000n);
  for (const balance of [1_950_000_000_000n, 2_000_000_000_000n, required - 1n]) {
    const [need, has] = sellGasNoticePt({ ethWei: balance, requiredWei: required }).text.match(/precisa de ≈ ([\d,]+) ETH.* e tem ≈ ([\d,]+) ETH/).slice(1);
    assert.equal(need, "0,0000021", String(balance));
    assert.notEqual(has, need, String(balance));
    const [shortHas, shortNeed] = gasShortfallPt({ balanceWei: balance, requiredWei: required }).match(/\(≈ ([\d,]+) ETH\).*\(≈ ([\d,]+) ETH\)/).slice(1);
    assert.equal(shortNeed, "0,0000021");
    assert.notEqual(shortHas, shortNeed, String(balance));
  }
  assert.match(sellGasNoticePt({ ethWei: 2_000_000_000_000n, requiredWei: required }).text, /e tem ≈ 0,000002 ETH/, "the balance rounds down");
  assert.match(sellGasNoticePt({ ethWei: 1_999_999_999_999n, requiredWei: required }).text, /e tem ≈ 0,0000019 ETH/);
});

test("ETH amounts read the pt-BR way, with two significant digits", () => {
  assert.equal(formatEthPt(50_000_000_000_000n), "0,00005");
  assert.equal(formatEthPt("40000000000000"), "0,00004");
  assert.equal(formatEthPt(31_234_000_000_000n), "0,000031");
  assert.equal(formatEthPt(300_000_000_000_000n), "0,0003");
});

test("buy review: the reserve gets its own line, only when the quote includes one", () => {
  assert.equal(GAS_RESERVE_LABEL_PT, "Reserva de ETH na sua carteira");
  assert.equal(gasReserveNotePt(RESERVE), "≈ 0,00005 ETH na Robinhood Chain, que fica na sua carteira");
  assert.deepEqual(gasReserveLinePt({ gasReserve: RESERVE }), { label: GAS_RESERVE_LABEL_PT, note: gasReserveNotePt(RESERVE), brl: 0.71 });
  assert.equal(gasReserveLinePt({ gasReserve: null }), null);
  assert.equal(gasReserveLinePt(null), null);
  const confirm = flowStep("src/flows/BuyFlow.jsx", "function ConfirmStep");
  assert.match(confirm, /const reserve = gasReserveLinePt\(quote\);/);
  assert.match(confirm, /\{reserve && <div className="is-sub"><dt>\{reserve\.label\}<small>\{reserve\.note\}<\/small><\/dt><dd>\{formatBRL\(reserve\.brl\)\}<\/dd><\/div>\}/);
});

test("the wallet check before a sell transaction: only advice that works while the sell is open", () => {
  // The sell is registered and blocks new operations on this device, so a new purchase (which
  // would top the reserve up) is never offered here; sending ETH and continuing is.
  const empty = gasShortfallPt({ balanceWei: "0", requiredWei: "2167500000000" });
  assert.match(empty, /^Falta ETH para a taxa de rede desta venda/);
  assert.match(empty, /somente pela rede Robinhood Chain, e depois continue esta venda/);
  // Some ETH left: a used-up reserve (dust) or a fee rise; neither is claimed.
  const dust = gasShortfallPt({ balanceWei: "1500000000000", requiredWei: "2167500000000" });
  const spike = gasShortfallPt({ balanceWei: "10000000000000", requiredWei: "43475000000000" });
  assert.match(dust, /≈ 0,0000015 ETH\) não cobre a taxa de rede desta confirmação \(≈ 0,0000022 ETH\)/);
  assert.match(spike, /≈ 0,00001 ETH/);
  assert.match(spike, /≈ 0,000044 ETH/, "0.000043475 ETH needed, rounded up");
  for (const text of [dust, spike]) {
    assert.match(text, /a reserva está no fim ou a taxa de rede subiu/);
    assert.match(text, /e depois continue esta venda/);
    assert.doesNotMatch(text, /mais alta agora/, "the balance alone does not show a fee spike");
  }
  // Unknown amounts never read as an empty wallet.
  for (const details of [null, { balanceWei: "1500000000000" }, { balanceWei: "x", requiredWei: "1" }]) {
    const text = gasShortfallPt(details);
    assert.match(text, /^O ETH da sua carteira não cobre a taxa de rede desta confirmação/, JSON.stringify(details));
    assert.doesNotMatch(text, /≈/);
  }
  for (const text of [empty, dust, spike, gasShortfallPt(null)]) {
    assert.match(text, /Enquanto esta venda estiver aberta, não é possível fazer uma nova compra\.$/);
    assert.doesNotMatch(text, /faça uma nova compra|repõe a reserva/);
  }
});

// A permit sell charges its network fee in its own quote, and its execution never touches the seller's ETH.
