import type {
  BrCreateSubaccountRequest,
  BrCreateSubaccountResponse,
  BrGetKycStatusResponse,
  BrGetSelfieLivenessUrlResponse,
  BrGetUserResponse,
  KybAttemptStatusResponse,
  KycLevel1Payload
} from "@vortexfi/shared";

export interface KybLevel1Response {
  attemptId: string;
  authorizedRepresentativeUrl: string;
  basicCompanyDataUrl: string;
}

export interface AveniaKycApi {
  createSubaccount(request: BrCreateSubaccountRequest): Promise<BrCreateSubaccountResponse>;
  getKycStatus(taxId: string, quoteId: string, sessionId?: string): Promise<BrGetKycStatusResponse>;
  getKybAttemptStatus(attemptId: string, signal?: AbortSignal): Promise<KybAttemptStatusResponse>;
  getSelfieLivenessUrl(taxId: string): Promise<BrGetSelfieLivenessUrlResponse>;
  getUser(taxId: string): Promise<BrGetUserResponse>;
  initiateKybLevel1(subAccountId?: string): Promise<KybLevel1Response>;
  submitNewKyc(payload: KycLevel1Payload): Promise<{ id: string }>;
}

export interface AveniaKycDeps {
  api: AveniaKycApi;
}
