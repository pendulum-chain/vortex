/**
 * National identifiers Alfred validates on individual KYC submissions (sandbox, 2026-09-30): a
 * wrong check digit fails the whole submission with `110002 Invalid field(s)`. Shared so the KYC
 * forms and the API validator reject the same values Alfred would.
 */

const CURP_ALPHABET = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** Mexican CURP: 18 characters, the last one a check digit over the first 17. Expects uppercase. */
export function isValidCurp(value: string): boolean {
  if (!/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[0-9A-Z]\d$/.test(value)) return false;
  const sum = [...value.slice(0, 17)].reduce((total, char, index) => total + CURP_ALPHABET.indexOf(char) * (18 - index), 0);
  return (10 - (sum % 10)) % 10 === Number(value[17]);
}

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Argentine CUIT/CUIL: 11 digits, the last one a mod-11 check digit. Separators must be stripped first. */
export function isValidCuit(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const remainder = CUIT_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0) % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  return check !== 10 && check === Number(digits[10]);
}
