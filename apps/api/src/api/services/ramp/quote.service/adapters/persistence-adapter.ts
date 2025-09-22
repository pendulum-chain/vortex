import { DestinationType, QuoteFeeStructure, RampCurrency, RampDirection } from "@packages/shared";
import { v4 as uuidv4 } from "uuid";
import QuoteTicket, { QuoteTicketMetadata } from "../../../../../models/quoteTicket.model";
import { QuoteContext } from "../types";

export interface PersistQuoteParams {
  request: {
    rampType: RampDirection;
    from: DestinationType;
    to: DestinationType;
    inputAmount: string;
    inputCurrency: RampCurrency;
    outputCurrency: RampCurrency;
  };
  feeDisplay: QuoteFeeStructure; // target display fiat structure
  usdFeeStructure: QuoteFeeStructure; // baseline USD structure
  outputAmountDecimalString: string; // final net output
  inputAmountForNablaSwapDecimal: string;
  onrampOutputAmountMoonbeamRaw: string;
  partnerId: string | null;
  discount?: {
    partnerId?: string;
    discount?: string;
    subsidyAmountInOutputToken?: string;
  };
  context: QuoteContext;
}

export class PersistenceAdapter {
  async createQuote(params: PersistQuoteParams): Promise<{ id: string; expiresAt: Date; record: QuoteTicket }> {
    const {
      context,
      request,
      feeDisplay,
      usdFeeStructure,
      outputAmountDecimalString,
      inputAmountForNablaSwapDecimal,
      onrampOutputAmountMoonbeamRaw,
      partnerId,
      discount
    } = params;

    const metadata: QuoteTicketMetadata = {
      context,
      inputAmountForNablaSwapDecimal,
      onrampOutputAmountMoonbeamRaw,
      usdFeeStructure
    };

    if (discount?.partnerId && discount?.discount && discount?.subsidyAmountInOutputToken) {
      metadata.subsidy = {
        discount: discount.discount,
        partnerId: discount.partnerId,
        subsidyAmountInOutputToken: discount.subsidyAmountInOutputToken
      };
    }

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: feeDisplay,
      from: request.from,
      id: uuidv4(),
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata,
      outputAmount: outputAmountDecimalString,
      outputCurrency: request.outputCurrency,
      partnerId,
      rampType: request.rampType,
      status: "pending",
      to: request.to
    });

    return { expiresAt: record.expiresAt, id: record.id, record };
  }
}
