import { describe, expect, it } from "bun:test";
import QuoteTicket from "../models/quoteTicket.model";

describe("leak probe", () => {
  it("checks whether QuoteTicket.findByPk was leaked from another test file", async () => {
    const fn = QuoteTicket.findByPk as unknown as { mock?: unknown };
    console.log("PROBE: findByPk is bun mock?", fn.mock !== undefined);
    if (fn.mock !== undefined) {
      const result = await (QuoteTicket.findByPk as unknown as (id: string) => Promise<unknown>)("nonexistent-quote-id");
      console.log("PROBE: findByPk('nonexistent-quote-id') returned:", JSON.stringify(result));
    }
    expect(true).toBe(true);
  });
});
