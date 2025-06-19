// POST /rating/create
export interface StoreRatingRequest {
  timestamp: string;
  rating: number;
  walletAddress: string;
}

export interface StoreRatingResponse {
  message: string;
}

export interface StoreRatingErrorResponse {
  error: string;
  details?: string;
}
