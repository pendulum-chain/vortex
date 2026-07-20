import { createAveniaKycApi, createAveniaKycMachine } from "@vortexfi/kyc";
import { apiClient } from "../services/api/api-client";

export const aveniaKycMachine = createAveniaKycMachine({
  api: createAveniaKycApi(apiClient)
});
