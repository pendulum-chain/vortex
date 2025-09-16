import { getEnvVar } from "./helpers/environment";

export const MOONBEAM_RECEIVER_CONTRACT_ADDRESS = "0x2AB52086e8edaB28193172209407FF9df1103CDc";

export const BRLA_BASE_URL = "https://api.sandbox.avenia.io:10952";

export const BRLA_API_KEY = getEnvVar("BRLA_API_KEY");
export const BRLA_PRIVATE_KEY = getEnvVar("BRLA_PRIVATE_KEY");

export const ALCHEMY_API_KEY = getEnvVar("ALCHEMY_API_KEY");
