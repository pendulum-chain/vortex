import type {
  BrlaCreateSubaccountRequest,
  BrlaCreateSubaccountResponse,
  BrlaGetKycStatusResponse,
  BrlaGetSelfieLivenessUrlResponse,
  BrlaGetUserResponse,
  KybAttemptStatusResponse,
  KycLevel1Payload
} from "@vortexfi/shared";

export interface KybLevel1Response {
  attemptId: string;
  authorizedRepresentativeUrl: string;
  basicCompanyDataUrl: string;
}

export interface AveniaKycApi {
  createSubaccount(request: BrlaCreateSubaccountRequest): Promise<BrlaCreateSubaccountResponse>;
  getKycStatus(taxId: string, quoteId: string, sessionId?: string): Promise<BrlaGetKycStatusResponse>;
  getKybAttemptStatus(attemptId: string, signal?: AbortSignal): Promise<KybAttemptStatusResponse>;
  getSelfieLivenessUrl(taxId: string): Promise<BrlaGetSelfieLivenessUrlResponse>;
  getUser(taxId: string): Promise<BrlaGetUserResponse>;
  initiateKybLevel1(subAccountId?: string): Promise<KybLevel1Response>;
  submitNewKyc(payload: KycLevel1Payload): Promise<{ id: string }>;
}

export interface AveniaKycDeps {
  api: AveniaKycApi;
}
