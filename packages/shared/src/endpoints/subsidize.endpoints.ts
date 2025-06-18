// POST /subsidize/preswap
export interface SubsidizePreSwapRequest {
  address: string;
  amountRaw: string;
  tokenToSubsidize: string;
}

export interface SubsidizePreSwapResponse {
  message: string;
}

// POST /subsidize/postswap
export interface SubsidizePostSwapRequest {
  address: string;
  amountRaw: string;
  token: string;
}

export interface SubsidizePostSwapResponse {
  message: string;
}

export interface SubsidizeErrorResponse {
  error: string;
  details?: string;
}
