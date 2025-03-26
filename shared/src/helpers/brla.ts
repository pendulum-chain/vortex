/**
 * Validates a tax id (CPF) vs a partially masked tax id received from BRLA's pix-info endpoint
 */
export function validateMaskedNumber(maskedCpf: string, fullCpf: string): boolean {
  if (!maskedCpf || !fullCpf) return false;

  if (maskedCpf.length !== fullCpf.length) throw new Error('Invalid comparison. Lengths do not match.');

  for (let i = 0; i < maskedCpf.length; i++) {
    if (maskedCpf[i] !== '*' && maskedCpf[i] !== fullCpf[i]) {
      return false;
    }
  }

  return true;
}
