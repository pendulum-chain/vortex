import { getEnvVar } from "./helpers/environment";

export const MOONBEAM_RECEIVER_CONTRACT_ADDRESS = "0x2AB52086e8edaB28193172209407FF9df1103CDc";

export const BRLA_BASE_URL = "https://api.brla.digital:5567/v1/business";

export const BRLA_LOGIN_USERNAME = getEnvVar("BRLA_LOGIN_USERNAME");
export const BRLA_LOGIN_PASSWORD = getEnvVar("BRLA_LOGIN_PASSWORD");

export const ALCHEMY_API_KEY = getEnvVar("ALCHEMY_API_KEY");
export const MOONBEAM_WSS = getEnvVar("MOONBEAM_WSS", "wss://moonbeam-rpc.n.dwellir.com");
