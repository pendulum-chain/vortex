// PR1 scaffolding: QuoteContext implementation and factory
// No behavior change; this is not yet wired into index.ts.

import { CreateQuoteRequest, DestinationType, RampCurrency, RampDirection, QuoteResponse } from "@packages/shared";
import Big from "big.js";
import { QuoteContext as IQuoteContext } from "../types";

export class QuoteContext implements IQuoteContext {
  readonly request: CreateQuoteRequest;
  readonly now: Date;

  partner: {
    id: string | null;
    discount?: number | undefined;
    name?: string | null | undefined;
  } | null;

  targetFeeFiatCurrency: RampCurrency;

  preNabla: IQuoteContext["preNabla"] = {};

  nabla: IQuoteContext["nabla"] | undefined;

  bridge: IQuoteContext["bridge"] | undefined;

  fees: IQuoteContext["fees"] | undefined;

  amounts: IQuoteContext["amounts"] | undefined;

  discount: IQuoteContext["discount"] | undefined;

  persistence: IQuoteContext["persistence"] | undefined;

  // PR2: allow engines to attach a ready QuoteResponse
  builtResponse?: QuoteResponse;

  notes: string[] | undefined;

  constructor(params: {
    request: CreateQuoteRequest;
    targetFeeFiatCurrency: RampCurrency;
    partner: { id: string | null; discount?: number; name?: string | null } | null;
    now?: Date;
  }) {
    this.request = params.request;
    this.targetFeeFiatCurrency = params.targetFeeFiatCurrency;
    this.partner = params.partner;
    this.now = params.now ?? new Date();
  }

  get isOnRamp(): boolean {
    return this.request.rampType === RampDirection.BUY;
  }

  get isOffRamp(): boolean {
    return this.request.rampType === RampDirection.SELL;
  }

  get from(): DestinationType {
    return this.request.from;
  }

  get to(): DestinationType {
    return this.request.to;
  }

  get direction(): RampDirection {
    return this.request.rampType;
  }

  // Helper to append debug notes during pipeline execution
  addNote(note: string) {
    if (!this.notes) this.notes = [];
    this.notes.push(note);
  }
}

// Factory for ease of construction (keeps future invariants in one place)
export function createQuoteContext(args: {
  request: CreateQuoteRequest;
  targetFeeFiatCurrency: RampCurrency;
  partner: { id: string | null; discount?: number; name?: string | null } | null;
  now?: Date;
}): QuoteContext {
  return new QuoteContext(args);
}
