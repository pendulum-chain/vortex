import { type AveniaKycApi, createAveniaKycApi } from "@vortexfi/kyc";
import { apiClient } from "./api-client";

const managedProfileApiClient = {
  get: <T>(url: string, config?: { params?: Record<string, string | number | boolean | undefined>; signal?: AbortSignal }) =>
    apiClient.get<T>(url, { ...config, managedProfile: true }),
  post: <T>(
    url: string,
    data?: unknown,
    config?: { headers?: Record<string, string>; params?: Record<string, string | number | boolean | undefined> }
  ) => apiClient.post<T>(url, data, { ...config, managedProfile: true })
};

export const AveniaService: AveniaKycApi = createAveniaKycApi(managedProfileApiClient);
