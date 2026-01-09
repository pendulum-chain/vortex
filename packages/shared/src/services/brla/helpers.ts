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

/**
 * Checks if all digits in a string are the same (e.g., "11111111111")
 */
function hasAllSameDigits(digits: string): boolean {
  if (digits.length === 0) return false;
  const firstDigit = digits[0];
  return digits.split("").every(d => d === firstDigit);
}

/**
 * Checks if digits form an ascending sequence (e.g., "12345678901" or "01234567890")
 */
function isAscendingSequence(digits: string): boolean {
  for (let i = 1; i < digits.length; i++) {
    const prev = parseInt(digits[i - 1], 10);
    const curr = parseInt(digits[i], 10);
    // Allow wrap-around from 9 to 0
    if (curr !== (prev + 1) % 10) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if digits form a descending sequence (e.g., "98765432109" or "10987654321")
 */
function isDescendingSequence(digits: string): boolean {
  for (let i = 1; i < digits.length; i++) {
    const prev = parseInt(digits[i - 1], 10);
    const curr = parseInt(digits[i], 10);
    // Allow wrap-around from 0 to 9
    if (curr !== (prev - 1 + 10) % 10) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if the input contains a trivial pattern (all same digits or sequential)
 */
function isTrivialPattern(input: string): boolean {
  // Extract only digits
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return false;

  return hasAllSameDigits(digits) || isAscendingSequence(digits) || isDescendingSequence(digits);
}

export function isValidCnpj(cnpj: string): boolean {
  if (!CNPJ_REGEX.test(cnpj)) return false;
  if (isTrivialPattern(cnpj)) return false;
  return true;
}

export function isValidCpf(cpf: string): boolean {
  if (!CPF_REGEX.test(cpf)) return false;
  if (isTrivialPattern(cpf)) return false;
  return true;
}
