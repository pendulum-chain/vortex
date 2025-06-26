export function formatPrice(price: Big | null | undefined): string {
  if (!price) return "0.00";
  const userLocale = navigator.language;

  return new Intl.NumberFormat(userLocale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(parseFloat(price.toFixed(2)));
}
