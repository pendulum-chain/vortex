import type { BrKYCDataUpload, BrKYCDataUploadRequest } from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const BrlaService = {
  getUploadUrls(request: BrKYCDataUploadRequest): Promise<BrKYCDataUpload> {
    return apiClient.post<BrKYCDataUpload>("/brla/getUploadUrls", request);
  }
};
