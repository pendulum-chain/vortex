import type { GetUserLimitsRequest, GetUserLimitsResponse } from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const LimitsService = {
  get: (request: GetUserLimitsRequest) => apiClient.post<GetUserLimitsResponse>("/limits", request)
};
