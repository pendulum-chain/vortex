export function verifyReferenceLabel(referenceLabel: string, memo: string): boolean {
  return referenceLabel === memo;
}

export function isValidReferenceLabel(label?: string): boolean {
  if (!label) return false;
  return label.length === 8;
}

type Quote = { id: string } | string;
export function generateReferenceLabel(quote: Quote): string {
  if (typeof quote === "string") {
    return quote.slice(0, 8);
  }
  return quote.id.slice(0, 8);
}
