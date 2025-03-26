import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from './storage/local';
import { OnChainToken, FiatToken } from '../constants/tokenConfig';
import { DestinationType, Networks } from '../helpers/networks';
import { SIGNING_SERVICE_URL } from '../constants/constants';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: `${SIGNING_SERVICE_URL}/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for common headers
apiClient.interceptors.request.use(
  (config) => {
    // Add any common headers here
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// Types for Ramp API

export interface PresignedTransaction {
  phase: string;
  tx_data: string;
  nonce?: number;
}

export interface RampQuoteRequest {
  rampType: 'on' | 'off';
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputCurrency: OnChainToken | FiatToken;
}

export interface RampQuoteResponse {
  id: string;
  rampType: 'on' | 'off';
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputAmount: string;
  outputCurrency: OnChainToken | FiatToken;
  fee: string;
  expiresAt: Date;
}

export interface StartRampRequest {
  quoteId: string;
  presignedTxs: PresignedTransaction[];
  additionalData?: {
    walletAddress?: string;
    pixDestination?: string;
    taxId?: string;
    brlaEvmAddress?: string;
    [key: string]: unknown;
  };
}

export interface RampProcess {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentPhase: string;
  progress: number;
  inputToken: OnChainToken;
  outputToken: OnChainToken | FiatToken;
  inputAmount: string;
  outputAmount: string;
  sourceNetwork: Networks;
  destinationNetwork?: Networks;
  createdAt: string;
  updatedAt: string;
}

export interface RampErrorLog {
  timestamp: string;
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Request a quote for ramping
 * @param request Quote request parameters
 * @returns Quote response with pricing information
 */
export const requestRampQuote = async (request: RampQuoteRequest): Promise<RampQuoteResponse> => {
  try {
    const response = await apiClient.post<RampQuoteResponse>('/ramp/quotes', request);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get quote: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
};

/**
 * Start a new ramping process
 * @param request Start ramp request with quote ID and presigned transactions
 * @returns Ramp process information
 */
export const startRampProcess = async (request: StartRampRequest): Promise<RampProcess> => {
  try {
    const response = await apiClient.post<RampProcess>('/ramp/start', request, config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to start ramp process: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
};

/**
 * Get the status of a ramping process
 * @param id The ID of the ramp process
 * @returns Current status and details of the ramp process
 */
export const getRampStatus = async (id: string): Promise<RampProcess> => {
  try {
    const response = await apiClient.get<RampProcess>(`/ramp/${id}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get ramp status: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
};

/**
 * Get error logs for a ramping process
 * @param id The ID of the ramp process
 * @returns Array of error logs for the ramp process
 */
export const getRampErrorLogs = async (id: string): Promise<RampErrorLog[]> => {
  try {
    const response = await apiClient.get<RampErrorLog[]>(`/ramp/${id}/errors`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get error logs: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
};

/**
 * Poll the status of a ramping process until it reaches a final state
 * @param id The ID of the ramp process
 * @param onUpdate Callback function to handle status updates
 * @param intervalMs Polling interval in milliseconds (default: 3000)
 * @param maxAttempts Maximum number of polling attempts (default: 100)
 * @returns The final status of the ramp process
 */
export const pollRampStatus = async (
  id: string,
  onUpdate?: (status: RampProcess) => void,
  intervalMs = 3000,
  maxAttempts = 100,
): Promise<RampProcess> => {
  let attempts = 0;

  const poll = async (): Promise<RampProcess> => {
    if (attempts >= maxAttempts) {
      throw new Error('Maximum polling attempts reached');
    }

    attempts++;
    const status = await getRampStatus(id);

    if (onUpdate) {
      onUpdate(status);
    }

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    return poll();
  };

  return poll();
};

/**
 * Create a complete ramping flow from quote to completion
 * @param quoteRequest Quote request parameters
 * @param presignedTxsProvider Function that returns presigned transactions based on the quote
 * @param additionalData Additional data required for the ramp process
 * @param onStatusUpdate Callback function to handle status updates
 * @returns The final status of the ramp process
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

export const storeUserEmailInBackend = async (data: { email: string; transactionId: string }) => {
  // TODO not implemented

  return;
};

export const storeUserRatingInBackend = async (data: { rating: number; walletAddress: string }) => {
  // TODO not implemented

  return;
};
