// In our inputs we use en-US format, where , is thousands separator and . is decimal separator
const locale = "en-US";

export function formatPrice(price: Big | null | undefined): string {
  if (!price) return "0.00";

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(parseFloat(price.toFixed(2)));
}
