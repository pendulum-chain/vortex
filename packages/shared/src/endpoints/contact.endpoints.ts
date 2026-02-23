// POST /contact/submit
export interface SubmitContactRequest {
  timestamp: string;
  fullName: string;
  email: string;
  projectName: string;
  inquiry: string;
}

export interface SubmitContactResponse {
  message: string;
}

export interface SubmitContactErrorResponse {
  error: string;
  details?: string;
}
