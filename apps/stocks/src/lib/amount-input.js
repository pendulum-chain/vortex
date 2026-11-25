// Translate at the input boundary. Quotes and saved selections always carry plain decimal strings.
// The decimal key is the phone's, not the page's language (an iPhone offers only its region's), so a lone
// foreign separator is a decimal unless it groups thousands: in English "0,5" is 0.5 and "1,500" is 1500.
export function parseAmountInput(input, locale, precision) {
  const text = String(input ?? "").trim();
  const pt = locale === "pt-BR";
  const grouped = pt ? /^[1-9]\d{0,2}(?:\.\d{3})+$/ : /^[1-9]\d{0,2}(?:,\d{3})+$/;
  const lone = /^\d+[.,]\d+$/.test(text) && !grouped.test(text);
  const [whole, fraction, ...rest] = lone ? text.split(/[.,]/) : text.split(pt ? "," : ".");
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
