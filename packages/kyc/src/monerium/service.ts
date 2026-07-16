import type { MoneriumKycApi } from "./api";
import type { MoneriumCustomerType, MoneriumStatusResponse } from "./types";
import { MoneriumAuthorizationRequiredError } from "./types";

type Params = Record<string, string | number | boolean | undefined>;

export interface MoneriumKycApiClient {
  get<T>(url: string, config?: { params?: Params; signal?: AbortSignal }): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}

function getErrorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

export function createMoneriumKycApi(apiClient: MoneriumKycApiClient): MoneriumKycApi {
  return {
    completeOAuth(code: string, state: string): Promise<MoneriumStatusResponse> {
      return apiClient.post<MoneriumStatusResponse>("/monerium/oauth/complete", { code, state });
    },
    async getStatus(customerType: MoneriumCustomerType): Promise<MoneriumStatusResponse> {
      try {
        return await apiClient.get<MoneriumStatusResponse>("/monerium/status", { params: { customerType } });
      } catch (error) {
        if (getErrorStatus(error) === 401 || getErrorStatus(error) === 404) {
          throw new MoneriumAuthorizationRequiredError();
        }
        throw error;
      }
    },
    startOAuth(customerType: MoneriumCustomerType): Promise<{ authorizationUrl: string }> {
      return apiClient.post<{ authorizationUrl: string }>("/monerium/oauth/start", { customerType });
    }
  };
}
