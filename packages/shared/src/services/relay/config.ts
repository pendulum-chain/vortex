import { getNetworkId, Networks } from "../../helpers/networks";

export const RELAY_DEFAULT_API_BASE_URL = "https://api.relay.link";

export const RELAY_DEPOSITORY_ADDRESS = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
export const RELAY_ORDER_SIGNER_ADDRESS = "0xf70da97812cb96acdf810712aa562db8dfa3dbef";
export const RELAY_BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const RELAY_ROBINHOOD_USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** `user` and `refundTo` of indicative quotes taken before the ramp's ephemeral exists. */
export const RELAY_PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

export const RELAY_BASE_CHAIN_ID = getNetworkId(Networks.Base);
export const RELAY_ROBINHOOD_CHAIN_ID = getNetworkId(Networks.Robinhood);
