export enum AlfredpayCustomerType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY" // Assuming COMPANY might exist based on INDIVIDUAL presence
}

export interface CreateAlfredpayCustomerRequest {
  type: AlfredpayCustomerType;
  country: string;
}

export interface CreateAlfredpayCustomerResponse {
  customerId: string;
  createdAt: string;
}

export interface FindAlfredpayCustomerResponse {
  customerId: string;
  country: string;
  createdAt: string;
  type: string;
}

export interface GetKycRedirectLinkResponse {
  verification_url: string;
  submissionId: string;
}

export enum AlfredpayKycStatus {
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  IN_REVIEW = "IN_REVIEW",
  UPDATE_REQUIRED = "UPDATE_REQUIRED",
  CREATED = "CREATED"
}

export interface GetKycStatusResponse {
  status: AlfredpayKycStatus;
  updatedAt: string;
  metadata?: {
    failureReason?: string;
    requiredFields?: string[];
  } | null;
}

export interface GetKycSubmissionResponse {
  submissionId: string;
  createdAt: string;
}
