import { sha256 } from 'ethers';
import { EvmAddress } from './brlaTeleportService';
import QuoteTicket from '../../../models/quoteTicket.model';

export function verifyReferenceLabel(referenceLabel: string, memo: string): boolean {
  return referenceLabel === memo;
}

export function isValidReferenceLabel(label?: string): boolean {
  if (!label) return false;
  return label.length === 8;
}

type QuoteId = string;

export function generateReferenceLabel(quote: QuoteTicket | QuoteId): string {
  if (typeof quote === 'string') {
    return quote.slice(0, 8);
  }
  return quote.id.slice(0, 8);
}
