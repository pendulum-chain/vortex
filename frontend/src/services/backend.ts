/**
 * @deprecated Use the new API services from 'services/api' instead
 * This file is kept for backward compatibility and will be removed in a future release
 */

import { DestinationType, FiatToken, Networks, OnChainToken, QuoteEndpoints, RampEndpoints } from 'shared';
import { EmailService } from './api/email.service';
import { QuoteService } from './api/quote.service';
import { RampService } from './api/ramp.service';
import { RatingService } from './api/rating.service';

// Re-export types for backward compatibility
export type PresignedTransaction = RampEndpoints.PresignedTransaction;

export interface RampQuoteRequest {
  rampType: 'on' | 'off';
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputCurrency: OnChainToken | FiatToken;
}

export type RampQuoteResponse = QuoteEndpoints.QuoteResponse;
export type StartRampRequest = {
  quoteId: string;
  presignedTxs: PresignedTransaction[];
  additionalData?: {
    walletAddress?: string;
    pixDestination?: string;
    taxId?: string;
    brlaEvmAddress?: string;
    [key: string]: unknown;
  };
};
export type RampProcess = RampEndpoints.RampProcess;
export type RampErrorLog = RampEndpoints.RampErrorLog;

/**
 * Request a quote for ramping
 * @param request Quote request parameters
 * @returns Quote response with pricing information
 * @deprecated Use QuoteService.createQuote instead
 */
export const requestRampQuote = async (request: RampQuoteRequest): Promise<RampQuoteResponse> => {
  return QuoteService.createQuote(
    request.rampType,
    request.from,
    request.to,
    request.inputAmount,
    request.inputCurrency,
    request.outputCurrency
  );
};

/**
 * Start a new ramping process
 * @param request Start ramp request with quote ID and presigned transactions
 * @returns Ramp process information
 * @deprecated Use RampService.startRamp instead
 */
export const startRampProcess = async (request: StartRampRequest): Promise<RampProcess> => {
  return RampService.startRamp(request.quoteId, request.presignedTxs, request.additionalData);
};

/**
 * Get the status of a ramping process
 * @param id The ID of the ramp process
 * @returns Current status and details of the ramp process
 * @deprecated Use RampService.getRampStatus instead
 */
export const getRampStatus = async (id: string): Promise<RampProcess> => {
  return RampService.getRampStatus(id);
};

/**
 * Get error logs for a ramping process
 * @param id The ID of the ramp process
 * @returns Array of error logs for the ramp process
 * @deprecated Use RampService.getRampErrorLogs instead
 */
export const getRampErrorLogs = async (id: string): Promise<RampErrorLog[]> => {
  return RampService.getRampErrorLogs(id);
};

/**
 * Poll the status of a ramping process until it reaches a final state
 * @param id The ID of the ramp process
 * @param onUpdate Callback function to handle status updates
 * @param intervalMs Polling interval in milliseconds (default: 3000)
 * @param maxAttempts Maximum number of polling attempts (default: 100)
 * @returns The final status of the ramp process
 * @deprecated Use RampService.pollRampStatus instead
 */
export const pollRampStatus = async (
  id: string,
  onUpdate?: (status: RampProcess) => void,
  intervalMs = 3000,
  maxAttempts = 100,
): Promise<RampProcess> => {
  return RampService.pollRampStatus(id, onUpdate, intervalMs, maxAttempts);
};

/**
 * Create a complete ramping flow from quote to completion
 * @param quoteRequest Quote request parameters
 * @param presignedTxsProvider Function that returns presigned transactions based on the quote
 * @param additionalData Additional data required for the ramp process
 * @param onStatusUpdate Callback function to handle status updates
 * @returns The final status of the ramp process
 * @deprecated Use a combination of QuoteService and RampService instead
 */
export const createRampFlow = async (
  quoteRequest: RampQuoteRequest,
  presignedTxsProvider: (quote: RampQuoteResponse) => Promise<PresignedTransaction[]>,
  additionalData?: StartRampRequest['additionalData'],
  onStatusUpdate?: (status: RampProcess) => void,
): Promise<RampProcess> => {
  // Step 1: Get a quote
  const quote = await requestRampQuote(quoteRequest);

  // Step 2: Generate presigned transactions
  const presignedTxs = await presignedTxsProvider(quote);

  // Step 3: Start the ramp process
  const rampProcess = await startRampProcess({
    quoteId: quote.id,
    presignedTxs,
    additionalData,
  });

  // Step 4: Poll for status updates until completion
  return pollRampStatus(rampProcess.id, onStatusUpdate);
};

/**
 * Store a user's email in the backend
 * @param data The email data
 * @deprecated Use EmailService.storeEmail instead
 */
export const storeUserEmailInBackend = async (data: { email: string; transactionId: string }) => {
  return EmailService.storeEmail(data.email, data.transactionId);
};

/**
 * Store a user's rating in the backend
 * @param data The rating data
 * @deprecated Use RatingService.storeRating instead
 */
export const storeUserRatingInBackend = async (data: { rating: number; walletAddress: string }) => {
  return RatingService.storeRating(data.rating, data.walletAddress);
};
