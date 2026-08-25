import type {
  BrCreateSubaccountRequest,
  BrCreateSubaccountResponse,
  BrGetKycStatusResponse,
  BrGetSelfieLivenessUrlResponse,
  BrGetUserResponse,
  KybAttemptStatusResponse,
  KycLevel1Payload
} from "@vortexfi/shared";
import type { AveniaKycApi, KybLevel1Response } from "./api";
import { KycSubmissionRejectedError } from "./types";

type Params = Record<string, string | number | boolean | undefined>;

export interface AveniaKycApiClient {
  get<T>(url: string, config?: { params?: Params; signal?: AbortSignal }): Promise<T>;
  post<T>(url: string, data?: unknown, config?: { headers?: Record<string, string>; params?: Params }): Promise<T>;
}

function getErrorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const data = "data" in error ? error.data : undefined;
  if (typeof data === "object" && data !== null && "details" in data && typeof data.details === "string") {
    return data.details;
  }
  if ("message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function createAveniaKycApi(apiClient: AveniaKycApiClient): AveniaKycApi {
  return {
    createSubaccount(request: BrCreateSubaccountRequest): Promise<BrCreateSubaccountResponse> {
      return apiClient.post<BrCreateSubaccountResponse>("/brla/createSubaccount", request);
    },
    getKybAttemptStatus(attemptId: string, signal?: AbortSignal): Promise<KybAttemptStatusResponse> {
      return apiClient.get<KybAttemptStatusResponse>("/brla/kyb/attempt-status", { params: { attemptId }, signal });
    },
    getKycStatus(taxId: string, quoteId: string, sessionId?: string): Promise<BrGetKycStatusResponse> {
      return apiClient.get<BrGetKycStatusResponse>("/brla/getKycStatus", { params: { quoteId, sessionId, taxId } });
    },
    getSelfieLivenessUrl(taxId: string): Promise<BrGetSelfieLivenessUrlResponse> {
      return apiClient.get<BrGetSelfieLivenessUrlResponse>("/brla/getSelfieLivenessUrl", { params: { taxId } });
    },
    getUser(taxId: string): Promise<BrGetUserResponse> {
      return apiClient.get<BrGetUserResponse>("/brla/getUser", { params: { taxId } });
    },
    initiateKybLevel1(subAccountId?: string): Promise<KybLevel1Response> {
      return apiClient.post<KybLevel1Response>("/brla/kyb/new-level-1/web-sdk", undefined, {
        params: subAccountId ? { subAccountId } : undefined
      });
    },
    async submitNewKyc(payload: KycLevel1Payload): Promise<{ id: string }> {
      try {
        return await apiClient.post<{ id: string }>("/brla/newKyc", payload);
      } catch (error) {
        if (getErrorStatus(error) === 400) {
          throw new KycSubmissionRejectedError(getErrorMessage(error, "Submission was rejected."));
        }
        throw error;
      }
    }
  };
}
