// pt-BR display formatting, lifted from Gold (apps/gold/src/App.jsx).

export const formatBRL = (value, digits = 2) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));

export const formatNumber = (value, digits = 3) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));

const isMissing = (value) => value == null || value === "" || !Number.isFinite(Number(value));

/** "+1,24%", "−0,52%" (U+2212 minus), "0,00%"; a value that rounds to zero carries no sign. */
export const formatPercent = (value, { digits = 2, signed = true } = {}) => {
  if (isMissing(value)) return "—";
  const number = Number(value);
  const magnitude = formatNumber(Math.abs(number), digits);
  if (/^[0.,]+$/.test(magnitude)) return `${magnitude}%`;
  return `${number < 0 ? "−" : signed ? "+" : ""}${magnitude}%`;
};

/** "▲ +1,24%" / "▼ −0,52%" / "0,00%": the arrow and sign carry the direction, never colour alone. */
export const formatChange = (pct) => {
  const text = formatPercent(pct);
  if (text === "—" || /^[0.,]+%$/.test(text)) return text;
  return `${Number(pct) < 0 ? "▼" : "▲"} ${text}`;
};

export const shortAddress = (address) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Preparando…";
