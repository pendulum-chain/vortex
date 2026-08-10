// Synthetic surface covering the shapes the serializer must render deterministically.

export enum FixtureDirection {
  BUY = "buy",
  SELL = "sell"
}

export type FixtureCurrency = "ars" | "brl" | "eur";

export interface FixtureNested {
  amountRaw: string;
  direction: FixtureDirection;
  readonly id: string;
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

export type FixtureOutcome<T extends FixtureRequest> = T extends { verbose: true } ? FixtureNested : FixtureCurrency;

export class FixtureClient {
  private secret: string;
  readonly retries: number;

  constructor(baseUrl: string, timeoutMs?: number) {
    this.secret = baseUrl + String(timeoutMs ?? 0);
    this.retries = 3;
  }

  createRequest(currency: FixtureCurrency, verbose?: boolean): Promise<FixtureRequest> {
    return Promise.reject(new Error(`${currency}${String(verbose)}${this.secret}`));
  }

  merge<T extends FixtureNested>(base: T, patch?: Partial<T>): T {
    return { ...base, ...patch };
  }
}
