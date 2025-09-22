import { QuoteFeeStructure, QuoteResponse } from "@packages/shared";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { trimTrailingZeros } from "../helpers";

export class QuoteMapper {
  // Build a QuoteResponse from persisted ticket + provided fee and output amount
  buildResponse(args: {
    ticket: QuoteTicket;
    feeDisplay: QuoteFeeStructure;
    outputAmountDecimalString: string;
  }): QuoteResponse {
    const { ticket, feeDisplay, outputAmountDecimalString } = args;

    return {
      expiresAt: ticket.expiresAt,
      fee: feeDisplay,
      from: ticket.from,
      id: ticket.id,
      inputAmount: trimTrailingZeros(ticket.inputAmount),
      inputCurrency: ticket.inputCurrency,
      outputAmount: trimTrailingZeros(outputAmountDecimalString),
      outputCurrency: ticket.outputCurrency,
      rampType: ticket.rampType,
      to: ticket.to
    };
  }
}
