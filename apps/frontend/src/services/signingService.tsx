import { BrlaCreateSubaccountRequest, BrlaGetKycStatusResponse, KycLevel1Payload } from "@vortexfi/shared";
import { SIGNING_SERVICE_URL } from "../constants/constants";
import { isApiError } from "./api/api-client";
import { BrlaService } from "./api/brla.service";

export enum KycStatus {
  PENDING = "PENDING",
  REJECTED = "REJECTED",
  APPROVED = "APPROVED"
}

export type KycStatusType = keyof typeof KycStatus;

type TaxIdType = "CPF" | "CNPJ";

export interface RegisterSubaccountPayload {
  phone: string;
  taxIdType: TaxIdType;
  address: {
    cep: string;
    city: string;
    state: string;
    street: string;
    number: string;
    district: string;
  };
  fullName: string;
  cpf: string;
  cnpj?: string;
  birthdate: number;
  companyName?: string;
  startDate?: number;
}

export const fetchKycStatus = async (taxId: string, quoteId: string, sessionId?: string) => {
  const statusResponse = await fetch(
    `${SIGNING_SERVICE_URL}/v1/brla/getKycStatus?taxId=${taxId}&quoteId=${quoteId}${sessionId ? `&sessionId=${sessionId}` : ""}`
  );

  if (statusResponse.status !== 200) {
    throw new Error(`Failed to fetch KYC status from server: ${statusResponse.statusText}`);
  }

  const eventStatus: BrlaGetKycStatusResponse = await statusResponse.json();
  return eventStatus;
};

export class SubaccountCreationRejectedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "SubaccountCreationRejectedError";
  }
}

export class SubaccountCreationNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubaccountCreationNetworkError";
  }
}

export class KycSubmissionRejectedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "KycSubmissionRejectedError";
  }
}

export class KycSubmissionNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycSubmissionNetworkError";
  }
}

export const createSubaccount = async ({
  name,
  accountType,
  taxId,
  quoteId,
  sessionId
}: BrlaCreateSubaccountRequest): Promise<{ subAccountId: string }> => {
  try {
    return await BrlaService.createSubaccount({ accountType, name, quoteId, sessionId, taxId });
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 400) {
        throw new SubaccountCreationRejectedError(error.data?.details || error.message || "Sub-account creation was rejected.");
      }
      if (error.status >= 500) {
        throw new SubaccountCreationNetworkError(`Failed to create sub-account due to a server error: ${error.message}`);
      }
      throw new SubaccountCreationNetworkError(`Failed to create sub-account: ${error.message}`);
    }
    throw error;
  }
};

export const submitNewKyc = async (kycData: KycLevel1Payload): Promise<{ id: string }> => {
  try {
    return await BrlaService.submitNewKyc(kycData);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 400) {
        throw new KycSubmissionRejectedError(error.data?.details || error.message || "Submission was rejected.");
      }
      if (error.status >= 500) {
        throw new KycSubmissionNetworkError(`Failed to submit KYC due to a server error: ${error.message}`);
      }
      throw new KycSubmissionNetworkError(`Failed to submit KYC: ${error.message}`);
    }
    throw error;
  }
};
