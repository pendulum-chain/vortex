import { Networks } from "@packages/shared";
import logger from "../../../config/logger";
import { MONERIUM_CLIENT_ID_APP, MONERIUM_CLIENT_SECRET } from "../../../constants/constants";
import {
  AddressExistsResponse,
  AuthContext,
  BeneficiaryDetails,
  FetchIbansParams,
  FetchProfileParams,
  IbanData,
  IbanDataResponse,
  MoneriumResponse,
  MoneriumTokenResponse,
  MoneriumUserProfile
} from "./types";

const MONERIUM_API_URL = "https://api.monerium.app";
export const ERC20_EURE_POLYGON: `0x${string}` = "0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6"; // EUR.e on Polygon
export const ERC20_EURE_POLYGON_DECIMALS = 18; // EUR.e on Polygon has 18 decimals

const HEADER_ACCEPT_V2 = { Accept: "application/vnd.monerium.api-v2+json" };
const HEADER_CONTENT_TYPE_FORM = { "Content-Type": "application/x-www-form-urlencoded" };

const authorize = async (): Promise<MoneriumTokenResponse> => {
  const url = `${MONERIUM_API_URL}/auth/token`;
  const headers = HEADER_CONTENT_TYPE_FORM;
  const body = new URLSearchParams({
    client_id: MONERIUM_CLIENT_ID_APP || "",
    client_secret: MONERIUM_CLIENT_SECRET || "",
    grant_type: "client_credentials"
  });

  const response = await fetch(url, {
    body,
    headers,
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const checkAddressExists = async (address: string, network: Networks): Promise<AddressExistsResponse | null> => {
  const { access_token } = await authorize();
  const url = `${MONERIUM_API_URL}/addresses/${address}`;
  const headers = {
    ...HEADER_ACCEPT_V2,
    Authorization: `Bearer ${access_token}`
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: AddressExistsResponse = await response.json();
    if (data.chains.includes(network)) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch address:", error);
    return null;
  }
};

export const getFirstMoneriumLinkedAddress = async (token: string): Promise<string | null> => {
  const url = "https://api.monerium.app/addresses";
  const headers = {
    ...HEADER_ACCEPT_V2,
    Authorization: `Bearer ${token}`
  };

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: MoneriumResponse = await response.json();

    if (data.addresses && data.addresses.length > 0) {
      const firstAddress = data.addresses[data.addresses.length - 1].address; // Ordered by creation date, so last is the most recent.
      return firstAddress;
    } else {
      logger.info("No addresses found in the response.");
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch addresses:", error);
    return null;
  }
};

export const getAuthContext = async (authToken: string): Promise<AuthContext> => {
  const url = `${MONERIUM_API_URL}/auth/context`;
  const headers = {
    ...HEADER_ACCEPT_V2,
    Authorization: `Bearer ${authToken}`
  };

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`No auth context found: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Failed to fetch auth context:", error);
    throw error;
  }
};

export const getMoneriumEvmDefaultMintAddress = async (token: string): Promise<string | null> => {
  // Assumption is the first linked address is the default mint address for Monerium EVM transactions.
  // TODO: this needs to be confirmed.
  return getFirstMoneriumLinkedAddress(token);
};

export const getMoneriumUserIban = async ({ authToken, profileId }: FetchIbansParams): Promise<IbanData> => {
  const baseUrl = `${MONERIUM_API_URL}/ibans`;
  const url = new URL(baseUrl);

  url.searchParams.append("profile", profileId);
  const headers = new Headers({
    ...HEADER_ACCEPT_V2,
    Authorization: `Bearer ${authToken}`
  });

  try {
    const response = await fetch(url.toString(), {
      headers: headers,
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data: IbanDataResponse = await response.json();
    // Look for the IBAN data specifically for the Polygon chain.
    // We choose Polygon as the default chain for Monerium EUR minting,
    // so user registered with us should always have a Polygon-linked  address.
    const ibanData = data.ibans.find(item => item.chain === "polygon");
    if (!ibanData) {
      throw new Error("No IBAN found for the specified chain (polygon)");
    }

    return ibanData;
  } catch (error) {
    console.error("Error fetching IBANs:", error);
    throw error;
  }
};

export const getMoneriumUserProfile = async ({ authToken, profileId }: FetchProfileParams): Promise<MoneriumUserProfile> => {
  const profileUrl = `${MONERIUM_API_URL}/profiles/${profileId}`;
  const headers = new Headers({
    ...HEADER_ACCEPT_V2,
    Authorization: `Bearer ${authToken}`
  });

  try {
    const profileResponse = await fetch(profileUrl, {
      headers: headers,
      method: "GET"
    });

    if (!profileResponse.ok) {
      throw new Error(`Profile API request failed with status ${profileResponse.status}: ${profileResponse.statusText}`);
    }

    const profileData: MoneriumUserProfile = await profileResponse.json();
    return profileData;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

export function createEpcQrCodeData(details: BeneficiaryDetails): string {
  const { name, iban, bic, amount } = details;

  if (!name || !iban || !bic || !amount) {
    throw new Error("Beneficiary name, IBAN, and BIC are required to create EPC QR code data.");
  }

  // EPC QR code data format; https://en.wikipedia.org/wiki/EPC_QR_code.
  const data = ["BCD", "001", "1", "SCT", bic, name, iban, `EUR${amount}`];

  return data.join("\n");
}
