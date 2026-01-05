import { Keyring } from "@polkadot/api";
import { EvmAddress } from "@vortexfi/shared";
import { keccak256 } from "viem/utils";
import { config } from "../../../config";
import { SIGNING_SERVICE_URL } from "../../../constants/constants";
import { fetchSep10Signatures as fetchSignatures, SignerServiceSep10Request } from "../../signingService";

// Returns the hash value for the address.
// If it's a polkadot address, it will return raw data of the address.
function getHashValueForAddress(address: string) {
  if (address.startsWith("0x")) {
    return address as EvmAddress;
  } else {
    const keyring = new Keyring({ type: "sr25519" });
    return keyring.decodeAddress(address);
  }
}

// A memo derivation.
async function deriveMemoFromAddress(address: string) {
  const hashValue = getHashValueForAddress(address);
  const hash = keccak256(hashValue);
  return BigInt(hash).toString().slice(0, 15);
}

export const exists = (value?: string | null): value is string => !!value && value?.length > 0;

export async function fetchSep10Signatures(args: SignerServiceSep10Request) {
  try {
    return await fetchSignatures(args);
  } catch (_error: unknown) {
    throw new Error("Could not fetch sep 10 signatures from backend");
  }
}

// Return the URLSearchParams and the account (master/omnibus or ephemeral) that was used for SEP-10
export async function getUrlParams(
  ephemeralAccount: string,
  usesMemo: boolean,
  supportsClientDomain: boolean,
  address: string
): Promise<{ urlParams: URLSearchParams; sep10Account: string }> {
  let sep10Account: string;
  const params = new URLSearchParams();

  if (usesMemo) {
    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`);
    if (!response.ok) {
      throw new Error("Failed to fetch client master SEP-10 public account.");
    }

    const { masterSep10Public } = await response.json();
    if (!masterSep10Public) {
      throw new Error("masterSep10Public not found in response.");
    }

    sep10Account = masterSep10Public;
    params.append("account", sep10Account);
    params.append("memo", await deriveMemoFromAddress(address));
  } else {
    sep10Account = ephemeralAccount;
    params.append("account", sep10Account);
  }

  if (supportsClientDomain) {
    params.append("client_domain", config.applicationClientDomain);
  }

  return { sep10Account, urlParams: params };
}
