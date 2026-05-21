import { getEnvVar, isSandboxEnabled } from "./helpers/environment";

export const SANDBOX_ENABLED = isSandboxEnabled();
export const NUMBER_OF_PRESIGNED_TXS = 5;

export const MOONBEAM_RECEIVER_CONTRACT_ADDRESS = "0x2AB52086e8edaB28193172209407FF9df1103CDc";

export const BRLA_BASE_URL =
  getEnvVar("BRLA_BASE_URL") || (SANDBOX_ENABLED ? "https://api.sandbox.avenia.io:10952" : "https://api.avenia.io:8443");

export const BRLA_API_KEY = getEnvVar("BRLA_API_KEY");
export const BRLA_PRIVATE_KEY = getEnvVar("BRLA_PRIVATE_KEY");

export const ALCHEMY_API_KEY = getEnvVar("ALCHEMY_API_KEY");

export const ALFREDPAY_BASE_URL = getEnvVar("ALFREDPAY_BASE_URL") || "https://penny-api-restricted-dev.alfredpay.io";
export const ALFREDPAY_API_KEY = getEnvVar("ALFREDPAY_API_KEY");
export const ALFREDPAY_API_SECRET = getEnvVar("ALFREDPAY_API_SECRET");

export const MYKOBO_BASE_URL =
  getEnvVar("MYKOBO_BASE_URL") || (SANDBOX_ENABLED ? "https://api-dev.mykobo.app/v1" : "https://api.mykobo.app/v1");
export const MYKOBO_ACCESS_KEY = getEnvVar("MYKOBO_ACCESS_KEY");
export const MYKOBO_SECRET_KEY = getEnvVar("MYKOBO_SECRET_KEY");
// Optional. Mykobo defaults the fee scope to `<network>.mykobo.app` when omitted.
export const MYKOBO_CLIENT_DOMAIN = getEnvVar("MYKOBO_CLIENT_DOMAIN");
