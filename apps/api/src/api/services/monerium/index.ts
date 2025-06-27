import { FetchIbansParams, IbanData, IbanDataResponse, MoneriumResponse } from "./types";

const MONERIOUM_API_URL = `https://api.monerium.app`;

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

interface BeneficiaryDetails {
  name: string;
  iban: string;
  bic: string;
}

export function createEpcQrCodeData(details: BeneficiaryDetails): string {
  const { name, iban, bic } = details;

  if (!name || !iban || !bic) {
    throw new Error("Beneficiary name, IBAN, and BIC are required to create EPC QR code data.");
  }

  const data = ["BCD", "001", "1", "SCT", bic, name, iban];

  return data.join("\n");
}
