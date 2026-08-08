// Synthetic surface covering the shapes the serializer must render deterministically.

export enum FixtureDirection {
  BUY = "buy",
  SELL = "sell"
}

export type FixtureCurrency = "ars" | "brl" | "eur";

export interface FixtureNested {
  amountRaw: string;
  direction: FixtureDirection;
}

export interface FixtureRequest {
  amounts: Record<FixtureCurrency, FixtureNested>;
  currency: FixtureCurrency;
  memo?: string;
  nested: FixtureNested;
  next?: FixtureRequest;
  tags: string[];
  tuple: [string, number];
  verbose?: boolean;
}

export type FixtureResult = FixtureNested | null;

export class FixtureClient {
  private secret: string;

  constructor(baseUrl: string, timeoutMs?: number) {
    this.secret = baseUrl + String(timeoutMs ?? 0);
  }

  createRequest(currency: FixtureCurrency, verbose?: boolean): Promise<FixtureRequest> {
    return Promise.reject(new Error(`${currency}${String(verbose)}${this.secret}`));
  }
}
