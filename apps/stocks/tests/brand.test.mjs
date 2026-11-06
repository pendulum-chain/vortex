import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BRAND, COLORS, FAMILY_LINKS, cssVariables } from "../src/brand.js";
import { APP, sourceFiles } from "./helpers.mjs";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test("the product name lives in one place: \"fatia.\" endorsed \"by Vortex\"", () => {
  assert.equal(BRAND.name, "fatia.");
  assert.equal(BRAND.endorsement, "by Vortex");
  assert.equal(BRAND.lockupAlt, "fatia. by Vortex");
  assert.equal(BRAND.privy.accentColor, COLORS.anil600);
  // Shown to every visitor, most of whom never used ouro.: no claim that a wallet already exists.
  assert.match(BRAND.privy.loginMessage, /^Se você usa o ouro\./);
  assert.doesNotMatch(BRAND.privy.loginMessage, /já está/);
  assert.match(BRAND.privy.accentColor, /^#[0-9A-F]{6}$/);
  // Library code takes the name from here; "fatia." appears in src/lib only inside comments.
  for (const file of sourceFiles().filter((item) => item.path.startsWith("src/lib/"))) {
    for (const [line] of file.text.matchAll(/^.*fatia\..*$/gm)) assert.match(line, /^\s*(\/\/|\*)/, `${file.path}: ${line.trim()}`);
  }
});

test("colours match tokens.json v1.0", () => {
  assert.deepEqual(
    { paper: COLORS.paper, surface: COLORS.surface, ink: COLORS.ink, textMuted: COLORS.textMuted, anil600: COLORS.anil600, anil700: COLORS.anil700, night: COLORS.night, positive: COLORS.positive, negative: COLORS.negative, warning: COLORS.warning },
    { paper: "#F7F6F2", surface: "#FFFFFF", ink: "#15161D", textMuted: "#5E5F66", anil600: "#3B38D0", anil700: "#2F2CAD", night: "#15173A", positive: "#0F7B4B", negative: "#B42B2B", warning: "#855600" },
  );
  for (const [name, value] of Object.entries(COLORS)) assert.match(value, /^#[0-9A-F]{6}$/, name);
});

test("text colours meet WCAG AA (4.5:1) on their grounds", () => {
  const pairs = [
    ["ink", "paper"], ["textMuted", "paper"], ["textMuted", "surface"], ["anil600", "paper"], ["anil600", "surface"],
    ["positive", "surface"], ["positive", "paper"], ["negative", "surface"], ["negative", "paper"], ["warning", "warningTint"],
    ["warning", "paper"], ["positive", "positiveTint"], ["negative", "negativeTint"], ["nightMuted", "night"], ["anil400", "night"],
  ];
  for (const [text, ground] of pairs) {
    const ratio = contrast(COLORS[text], COLORS[ground]);
    assert.ok(ratio >= 4.5, `${text} on ${ground}: ${ratio.toFixed(2)}:1`);
  }
  assert.ok(contrast(COLORS.textSubtle, COLORS.paper) < 4.5, "textSubtle is decoration only");
});

test("brand assets exist and no copy says \"Conta Vortex\" (the sign-in is \"Entrar com Vortex\", from the kit)", () => {
  for (const path of Object.values(BRAND.assets)) assert.ok(existsSync(join(APP, "public", path)), path);
  for (const file of sourceFiles()) assert.doesNotMatch(file.text, /Conta Vortex/, file.path);
  assert.doesNotMatch(readFileSync(join(APP, "index.html"), "utf8"), /Conta Vortex/);
});

test("family links stay on this origin and Family Safe is a descriptor only", () => {
  assert.equal(FAMILY_LINKS.ouro.href, "/pt-br/gold/");
  assert.equal(FAMILY_LINKS.business.href, "/pt-br/business/");
  assert.equal(FAMILY_LINKS.familySafe.descriptorPt, "Plano de emergência digital");
  assert.equal(FAMILY_LINKS.familySafe.descriptorEn, "Family Safe");
  assert.equal(FAMILY_LINKS.familySafe.chipPt, "Conceito");
  assert.ok(!("name" in FAMILY_LINKS.familySafe));
});

test("CSS custom properties are generated from the colour tokens", () => {
  const css = cssVariables();
  assert.match(css, /--paper: #F7F6F2;/);
  assert.match(css, /--anil-600: #3B38D0;/);
  assert.match(css, /--text-muted: #5E5F66;/);
  assert.match(css, /--font-numeric: "DM Mono"/);
  assert.match(css, /--radius-sheet: 24px;/);
});

test("styles.css carries exactly the generated token block (one source: brand.js)", () => {
  const css = readFileSync(join(APP, "src/styles.css"), "utf8");
  const block = css.slice(css.indexOf("/* tokens:start */") + "/* tokens:start */".length, css.indexOf("/* tokens:end */")).trim();
  assert.equal(block, cssVariables());
});
