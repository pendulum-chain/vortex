import type { CreateQuoteRequest, QuoteFeeStructure, RampCurrency, RampPhase } from "@vortexfi/shared";
import type { Big } from "big.js";
import type { PartnerInfo } from "../../core/types";

export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;
  amountRaw: string;
  token: Token;
  chain: Chain;
  meta: Record<string, unknown>;
}

export interface PhaseCtx {
  request: CreateQuoteRequest & { userId?: string };
  partner: PartnerInfo | null;
  now: Date;
  notes: string[];
  addNote(note: string): void;
  fees?: {
    usd?: { vortex: string; anchor: string; partnerMarkup: string; network: string; total: string };
    displayFiat?: QuoteFeeStructure;
  };
}

export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];
  simulate(input: I, ctx: PhaseCtx): Promise<O>;
}

export interface Flow {
  readonly name: string;
  readonly phases: RampPhase[];
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
}
