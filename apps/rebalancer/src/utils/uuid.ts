export function generateUUID(): string {
  // Generate a UUID using the crypto API
  return crypto.randomUUID();
}
