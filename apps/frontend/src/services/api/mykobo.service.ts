import { apiClient, isApiError } from "./api-client";

export type MykoboKycReviewStatus = "pending" | "approved" | "rejected";

export interface MykoboKycStatus {
  receivedAt: string | null;
  reviewStatus: MykoboKycReviewStatus;
}

export interface MykoboProfile {
  firstName: string;
  lastName: string;
  emailAddress: string;
  bankAccountNumber: string;
  kycStatus: MykoboKycStatus;
  createdAt: string;
}

export interface MykoboProfilePayload {
  firstName: string;
  lastName: string;
  emailAddress: string;
  addressLine1: string;
  city: string;
  idCountryCode: string;
  bankAccountNumber: string;
  walletAddress: string;
  sourceOfFunds: "EMPLOYMENT" | "SAVINGS" | "LOANS" | "INVESTMENT" | "INHERITANCE";
  taxCountry: string;
  idType: "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";
  front: File;
  back?: File;
  face: File;
  utilityBill: File;
}

export const MykoboService = {
  async createProfile(payload: MykoboProfilePayload): Promise<MykoboProfile> {
    const form = new FormData();
    form.append("first_name", payload.firstName);
    form.append("last_name", payload.lastName);
    form.append("email_address", payload.emailAddress);
    form.append("address_line_1", payload.addressLine1);
    form.append("city", payload.city);
    form.append("id_country_code", payload.idCountryCode);
    form.append("bank_account_number", payload.bankAccountNumber);
    form.append("wallet_address", payload.walletAddress);
    form.append("source_of_funds", payload.sourceOfFunds);
    form.append("tax_country", payload.taxCountry);
    form.append("id_type", payload.idType);
    form.append("front", payload.front);
    if (payload.back) form.append("back", payload.back);
    form.append("face", payload.face);
    form.append("utility_bill", payload.utilityBill);

    const data = await apiClient.post<{ profile: MykoboProfile }>("/mykobo/profiles", form);
    return data.profile;
  },
  async getProfile(walletAddress: string): Promise<MykoboProfile | null> {
    try {
      const data = await apiClient.get<{ profile: MykoboProfile }>("/mykobo/profiles", {
        params: { address: walletAddress }
      });
      return data.profile;
    } catch (error: unknown) {
      if (isApiError(error) && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
};
