import { DestinationType, QuoteFeeStructure, RampCurrency, RampDirection } from "@packages/shared";
import { v4 as uuidv4 } from "uuid";
import QuoteTicket, { QuoteTicketMetadata } from "../../../../../models/quoteTicket.model";

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
}

export class PersistenceAdapter {
  async createQuote(params: PersistQuoteParams): Promise<{ id: string; expiresAt: Date; record: QuoteTicket }> {
    const { request, feeDisplay, usdFeeStructure, outputAmountDecimalString, inputAmountForNablaSwapDecimal, onrampOutputAmountMoonbeamRaw, partnerId, discount } =
      params;

    const metadata: QuoteTicketMetadata = {
      inputAmountForNablaSwapDecimal,
      onrampOutputAmountMoonbeamRaw,
      usdFeeStructure
    };

    if (discount?.partnerId && discount?.discount && discount?.subsidyAmountInOutputToken) {
      metadata.subsidy = {
        partnerId: discount.partnerId,
        discount: discount.discount,
        subsidyAmountInOutputToken: discount.subsidyAmountInOutputToken
      };
    }

    const record = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount: outputAmountDecimalString,
      outputCurrency: request.outputCurrency,
      fee: feeDisplay,
      partnerId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: "pending",
      metadata
    });

    return { id: record.id, expiresAt: record.expiresAt, record };
  }
}
