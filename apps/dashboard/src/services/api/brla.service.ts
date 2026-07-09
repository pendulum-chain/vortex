import type { AveniaKYCDataUpload, AveniaKYCDataUploadRequest } from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const BrlaService = {
  getUploadUrls(request: AveniaKYCDataUploadRequest): Promise<AveniaKYCDataUpload> {
    return apiClient.post<AveniaKYCDataUpload>("/brla/getUploadUrls", request);
  }
};
