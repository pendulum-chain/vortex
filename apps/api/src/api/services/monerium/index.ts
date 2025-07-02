import { Networks } from "@packages/shared";
import { MONERIUM_CLIENT_ID_APP, MONERIUM_CLIENT_SECRET } from "../../../constants/constants";
import {
  AddressExistsResponse,
  BeneficiaryDetails,
  FetchIbansParams,
  FetchProfileParams,
  IbanData,
  IbanDataResponse,
  MoneriumResponse,
  MoneriumTokenResponse,
  MoneriumUserProfile
} from "./types";

const MONERIOUM_API_URL = "https://api.monerium.app";

const authorize = async (): Promise<MoneriumTokenResponse> => {
  const url = `${MONERIOUM_API_URL}/auth/token`;
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
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
  const url = `${MONERIOUM_API_URL}/addresses/${address}`;
  const headers = {
    Accept: "application/vnd.monerium.api-v2+json",
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
    Accept: "application/vnd.monerium.api-v2+json",
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
      console.log("No addresses found in the response.");
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch addresses:", error);
    return null;
  }
};

export const getMoneriumEvmDefaultMintAddress = async (token: string): Promise<string | null> => {
  // Assumption is the first linked address is the default mint address for Monerium EVM transactions.
  // TODO: this needs to be confirmed.
  return getFirstMoneriumLinkedAddress(token);
};

export const getMoneriumUserIban = async ({ authToken }: FetchIbansParams): Promise<IbanData> => {
  const baseUrl = `${MONERIOUM_API_URL}/ibans`;
  const url = new URL(baseUrl);

  const headers = new Headers({
    Accept: "application/vnd.monerium.api-v2+json",
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
  const profileUrl = `${MONERIOUM_API_URL}/profiles/${profileId}`;
  const headers = new Headers({
    Accept: "application/vnd.monerium.api-v2+json",
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

  const data = ["BCD", "001", "1", "SCT", bic, name, iban, `EUR${amount}`];

  return data.join("\n");
}
