export function formatPrice(price: Big | null | undefined): string {
  if (!price) return '0.00';
  const userLocale = navigator.language;

  return new Intl.NumberFormat(userLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(price.toFixed(2)));
}
