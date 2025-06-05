// Common types used across endpoints

/**
 * Ethereum Virtual Machine address type
 * Represents a hexadecimal string starting with "0x"
 */
export type EvmAddress = `0x${string}`;

export interface EphemeralAccount {
  secret: string;
  address: string;
}
