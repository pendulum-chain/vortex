export const INTERNATIONAL_PATH = "/en/stocks/";
export const BRAZIL_PATH = "/pt-br/stocks/";
export const stocksLocale = (path = "") => /^\/en\/stocks(?:\/|$)/.test(path) ? "en" : "pt-BR";
export const formatUsdc = (amount, digits = 2, locale = "en-US") => `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(amount))} USDC`;
export const formatUsd = (amount) => amount == null || !Number.isFinite(Number(amount)) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
export const formatTokensEn = (amount) => {
  const [w, f = ""] = String(amount).split(".");
  return `${new Intl.NumberFormat("en-US").format(BigInt(w || "0"))}.${f.padEnd(4, "0").slice(0, 4)}`;
};
