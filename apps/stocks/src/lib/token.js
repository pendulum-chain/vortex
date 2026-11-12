// Token amounts, shares and the ERC-8056 uiMultiplier. BigInt only until display: a float must
// never decide how many tokens are sold ("Usar tudo" sells the exact raw balance, no dust, no oversell).
// Stock Tokens have 18 decimals; one token represents uiMultiplier/1e18 shares (dividends reinvested).
import { formatUnits, parseUnits } from "viem";
import { StocksRampError } from "./ramp-contract.js";

export const TOKEN_DECIMALS = 18;
export const WEI = 10n ** 18n;

const AMOUNT_PATTERN = /^(\d*)(?:[.,](\d*))?$/;

/** "1,5" | "1.5" -> 1500000000000000000n. Throws on more than 18 decimals, signs, grouping or junk. */
export function tokensToWei(input) {
  const text = String(input ?? "").trim();
  const match = AMOUNT_PATTERN.exec(text);
  if (!text || !match || !(match[1] || match[2])) throw new Error("Informe uma quantidade válida de tokens.");
  const fraction = match[2] || "";
  if (fraction.length > TOKEN_DECIMALS) throw new Error("Use no máximo 18 casas decimais.");
  return parseUnits(`${match[1] || "0"}.${fraction || "0"}`, TOKEN_DECIMALS);
}

export const weiToTokens = (raw) => formatUnits(BigInt(raw), TOKEN_DECIMALS);

/** Shares represented by a raw balance: raw * multiplier / 1e18 (floored). */
export const sharesWei = (raw, multiplierWei) => (BigInt(raw) * BigInt(multiplierWei)) / WEI;

/** The on-chain multiplier when read, else the bundled snapshot. */
export function multiplierWeiFor(token, onChainWei = null) {
  if (onChainWei != null) return BigInt(onChainWei);
  return parseUnits(token.multiplierSnapshot, TOKEN_DECIMALS);
}

/** "0.489899999" -> "0.4898" at 4 dp: string truncation, never rounds up. */
export function floorDisplay(decimalString, dp) {
  const [whole, fraction = ""] = String(decimalString).split(".");
  if (dp <= 0) return whole;
  return `${whole}.${fraction.padEnd(dp, "0").slice(0, dp)}`;
}

/** Display only: tokens x BRL per token (a per-token market price already includes the multiplier). */
export function positionValueBrl(raw, brlPerToken) {
  if (!Number.isFinite(Number(brlPerToken)) || Number(brlPerToken) <= 0) return null;
  return Number(formatUnits(BigInt(raw), TOKEN_DECIMALS)) * Number(brlPerToken);
}

/** "Usar tudo": the exact raw balance as a decimal string (no rounding). */
export const maxSellAmount = (raw) => formatUnits(BigInt(raw), TOKEN_DECIMALS);

export function assertSellBalance(raw, tokenAmountWei) {
  const amount = BigInt(tokenAmountWei);
  if (amount <= 0n || BigInt(raw ?? 0n) < amount) throw new StocksRampError("INSUFFICIENT_BALANCE");
}

/** Display estimate before fees ("≈ 0,43 token antes das taxas"), floored at 18 dp. */
export function estimateTokensForBrl(brlAmount, brlPerToken) {
  const brl = Number(brlAmount);
  const price = Number(brlPerToken);
  if (!(brl > 0) || !(price > 0)) return null;
  return formatUnits((parseUnits(brl.toFixed(2), TOKEN_DECIMALS) * WEI) / parseUnits(String(price), TOKEN_DECIMALS), TOKEN_DECIMALS);
}

const groupInteger = (digits) => new Intl.NumberFormat("pt-BR").format(BigInt(digits || "0"));

/** pt-BR display of a decimal token string, floored: "1234.56789" -> "1.234,5678" (dp 4). */
export function formatTokenAmount(decimalString, { dp = 4, trim = false } = {}) {
  const [whole, fraction = ""] = floorDisplay(decimalString, dp).split(".");
  const shown = trim ? fraction.replace(/0+$/, "") : fraction;
  return shown ? `${groupInteger(whole)},${shown}` : groupInteger(whole);
}

// pt-BR agreement: below 2 the noun is singular ("0,49 ação", "1,5 ação"), zero and 2+ are plural.
const pluralFor = (decimalString) => {
  const value = Number(decimalString);
  return value === 0 || value >= 2;
};

function formatCount(raw, singular, plural, dp) {
  const value = BigInt(raw);
  if (value === 0n) return `0 ${plural}`;
  const decimal = formatUnits(value, TOKEN_DECIMALS);
  if (value > 0n && /^0\.?0*$/.test(floorDisplay(decimal, dp))) return `< ${formatTokenAmount(`0.${"0".repeat(dp - 1)}1`, { dp })} ${singular}`;
  const floored = floorDisplay(decimal, dp);
  return `${formatTokenAmount(decimal, { dp })} ${pluralFor(floored) ? plural : singular}`;
}

/** 489899999999999999n -> "0,4898 token" */
export const formatTokensPt = (raw, dp = 4) => formatCount(raw, "token", "tokens", dp);

/** "≈ 0,4902 ação" from sharesWei() */
export const formatSharesApproxPt = (rawShares, dp = 4) => `≈ ${formatCount(rawShares, "ação", "ações", dp)}`;

/**
 * 1000775159164630595n -> "1,0008" (the "1 token ≈ 1,0008 ação" line). Rounded half up: it is a
 * ratio shown for information, not an amount anyone can sell (amounts are always floored).
 */
/**
 * The rights card's dividend line (dividends are reinvested through the multiplier). At exactly 1
 * (no dividend reinvested yet) it says 1 token = 1 ação today instead of "um pouco mais (1,0000)".
 * @param {bigint|string|null} multiplierWei null: generic, no token
 */
export function dividendsLinePt(multiplierWei = null) {
  const base = "Sem direito a voto. Não há dividendos em dinheiro: eles são reinvestidos no token";
  if (multiplierWei == null) return `${base}, que passa a representar um pouco mais que uma ação.`;
  if (BigInt(multiplierWei) <= WEI) return `${base}. Hoje, 1 token = 1 ação; a cada dividendo reinvestido, ele passa a representar um pouco mais.`;
  return `${base}, e cada token passa a representar um pouco mais que uma ação (multiplicador atual ${formatMultiplier(multiplierWei)}).`;
}

export function formatMultiplier(multiplierWei, dp = 4) {
  const step = 10n ** BigInt(TOKEN_DECIMALS - dp);
  const rounded = ((BigInt(multiplierWei) + step / 2n) / step) * step;
  return formatTokenAmount(formatUnits(rounded, TOKEN_DECIMALS), { dp });
}
