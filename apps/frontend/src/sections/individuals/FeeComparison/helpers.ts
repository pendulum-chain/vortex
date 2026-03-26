import Big from "big.js";

// In our inputs we use en-US format, where , is thousands separator and . is decimal separator
const locale = "en-US";

/**
 * Safely parse an en-US formatted number string (e.g. "10,000.00") into a Big instance.
 * Strips thousands separators (commas) before constructing the Big value.
 */
export function parseBig(value: string): Big {
  return Big(value.replace(/,/g, ""));
}

export function formatPrice(price: Big | null | undefined): string {
  if (!price) return "0.00";

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(parseFloat(price.toFixed(2)));
}
