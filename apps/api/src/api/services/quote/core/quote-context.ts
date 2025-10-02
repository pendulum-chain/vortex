/**
 * QuoteContext factory.
 * Holds request-scoped data that flows through the quote pipeline.
 *
 * This replaces the class implementation with a single factory that returns
 * an object literal which satisfies the QuoteContext interface, removing
 * duplication between class fields and interface.
 */

import { CreateQuoteRequest, RampCurrency, RampDirection } from "@packages/shared";
import type { QuoteContext as IQuoteContext, PartnerInfo } from "./types";

export function createQuoteContext(args: {
  request: CreateQuoteRequest;
  targetFeeFiatCurrency: RampCurrency;
  partner: PartnerInfo | null;
  now?: Date;
}): IQuoteContext {
  let notes: string[] | undefined;

  const ctx = {
    // Helper to append debug notes during pipeline execution
    addNote(this: IQuoteContext, note: string) {
      if (!notes) notes = [];
      notes.push(note);
      this.notes = notes;
    },
    get direction() {
      return this.request.rampType;
    },
    get from() {
      return this.request.from;
    },
    get isOffRamp() {
      return this.request.rampType === RampDirection.SELL;
    },

    // Helper accessors
    get isOnRamp() {
      return this.request.rampType === RampDirection.BUY;
    },
    now: args.now ?? new Date(),
    partner: args.partner,

    // Provide a default object to keep stage logic simple; optional by interface.
    preNabla: {},
    request: args.request,
    targetFeeFiatCurrency: args.targetFeeFiatCurrency,
    get to() {
      return this.request.to;
    }
  } satisfies IQuoteContext;

  return ctx;
}
