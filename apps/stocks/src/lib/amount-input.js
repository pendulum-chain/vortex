// Translate at the input boundary. Quotes and saved selections always carry plain decimal strings.
export function parseAmountInput(input, locale, precision) {
  const text = String(input ?? "").trim();
  const pt = locale === "pt-BR";
  const [whole, fraction, ...rest] = text.split(pt ? "," : ".");
  const grouped = pt ? /^[1-9]\d{0,2}(?:\.\d{3})+$/ : /^[1-9]\d{0,2}(?:,\d{3})+$/;
  if (rest.length || (!/^\d+$/.test(whole) && !grouped.test(whole))) return null;
  if (fraction !== undefined && (!/^\d+$/.test(fraction) || fraction.length > (precision || 2))) return null;
  const digits = (fraction || "").replace(/0+$/, "");
  if (precision === 0 && digits) return null;
  const integer = whole.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  return digits ? integer + "." + digits : integer;
}

export function displayAmount(canonical, locale) {
  return locale === "pt-BR" ? String(canonical).replace(".", ",") : String(canonical);
}
