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

export const CPF_REGEX = /^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/;
export const CNPJ_REGEX = /^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/;

export function isValidCnpj(cnpj: string): boolean {
  return CNPJ_REGEX.test(cnpj);
}

export function isValidCpf(cpf: string): boolean {
  return CPF_REGEX.test(cpf);
}
