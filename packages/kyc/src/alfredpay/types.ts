import type { SubmitKybInformationRequest, SubmitKycInformationRequest } from "@vortexfi/shared";

/**
 * Generic Alfredpay KYC form payload (country is added by the API layer).
 * Fields are a union across MX/CO/AR; country-specific schemas pick which are required.
 */
export type AlfredpayKycFormData = Omit<SubmitKycInformationRequest, "country">;
export type KybFormData = Omit<SubmitKybInformationRequest, "country">;

export interface MxnKycFiles {
  front: File;
  back: File;
  selfie?: File;
}

export interface KybBusinessFiles {
  taxIdDocument: File;
  articlesIncorporation: File;
  proofAddress: File;
  docFront: File;
  docBack: File;
}

export interface KybPersonFiles {
  front: File;
  back: File;
}

export enum AlfredpayKycMachineErrorType {
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}

export class AlfredpayKycMachineError extends Error {
  type: AlfredpayKycMachineErrorType;
  constructor(message: string, type: AlfredpayKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

/**
 * Everything the machine tracks. Also its input type: a host starts it with `country` (plus
 * `business` for a KYB deep link), and may replay a `submissionId` to resume a half-finished
 * upload. Deliberately free of any host state — the widget's ramp context stays in the widget.
 */
export interface AlfredpayKycContext {
  country: string;
  business?: boolean;
  verificationUrl?: string;
  submissionId?: string;
  error?: AlfredpayKycMachineError;
  mxnFormData?: AlfredpayKycFormData;
  mxnFiles?: MxnKycFiles;
  kybFormData?: KybFormData;
  kybBusinessFiles?: KybBusinessFiles;
  kybRelatedPersonFiles?: KybPersonFiles[];
  kybRelatedPersonIndex?: number;
  kybRelatedPersonIds?: string[];
}

export interface AlfredpayKycOutput {
  error?: AlfredpayKycMachineError;
}
