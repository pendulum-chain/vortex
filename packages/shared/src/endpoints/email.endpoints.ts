// POST /email/create
export interface StoreEmailRequest {
  timestamp: string;
  email: string;
  transactionId: string;
}

export interface StoreEmailResponse {
  message: string;
}

export interface StoreEmailErrorResponse {
  error: string;
  details?: string;
}
