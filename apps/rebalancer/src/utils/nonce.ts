import type { PublicClient } from "viem";

export class NonceManager {
  private nonce: number;

  constructor(startingNonce: number) {
    this.nonce = startingNonce;
  }

  static async create(client: PublicClient, address: `0x${string}`): Promise<NonceManager> {
    const nonce = await client.getTransactionCount({ address });
    return new NonceManager(nonce);
  }

  next(): number {
    return this.nonce++;
  }
}
