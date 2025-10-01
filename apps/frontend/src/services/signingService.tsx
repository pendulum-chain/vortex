import { BrlaGetKycStatusResponse, CreateAveniaSubaccountRequest, FiatToken, KycLevel1Payload } from "@packages/shared";
import { useQuery } from "@tanstack/react-query";
import { SIGNING_SERVICE_URL } from "../constants/constants";

interface AccountStatusResponse {
  status: boolean;
  public: string;
}

interface SigningServiceStatus {
  pendulum: AccountStatusResponse;
  stellar: AccountStatusResponse;
  moonbeam: AccountStatusResponse;
}

interface SignerServiceSep10Response {
  clientSignature: string;
  clientPublic: string;
  masterClientSignature: string;
  masterClientPublic: string;
}

type BrlaOfframpState = "BURN" | "MONEY-TRANSFER";
type OfframpStatus = "QUEUED" | "POSTED" | "SUCCESS" | "FAILED";

export enum KycStatus {
  PENDING = "PENDING",
  REJECTED = "REJECTED",
  APPROVED = "APPROVED"
}

export type KycStatusType = keyof typeof KycStatus;

interface BrlaOfframpStatus {
  type: BrlaOfframpState;
  status: OfframpStatus;
}

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
  birthdate: number; // Denoted in milliseconds since epoch
  companyName?: string;
  startDate?: number; // Denoted in milliseconds since epoch
}

export interface SignerServiceSep10Request {
  challengeXDR: string;
  outToken: FiatToken;
  clientPublicKey: string;
  address: string;
  usesMemo?: boolean;
}

// Generic error for signing service
export class SigningServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningServiceError";
  }
}

// Specific errors for each funding account
export class StellarFundingAccountError extends SigningServiceError {
  constructor() {
    super("Stellar account is inactive");
    this.name = "StellarFundingAccountError";
  }
}

export class PendulumFundingAccountError extends SigningServiceError {
  constructor() {
    super("Pendulum account is inactive");
    this.name = "PendulumFundingAccountError";
  }
}

export class MoonbeamFundingAccountError extends SigningServiceError {
  constructor() {
    super("Moonbeam account is inactive");
    this.name = "MoonbeamFundingAccountError";
  }
}

export const fetchSigningServiceAccountId = async (): Promise<SigningServiceStatus> => {
  try {
    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/status`);
    if (!response.ok) {
      throw new SigningServiceError("Failed to fetch signing service status");
    }

    const serviceResponse: SigningServiceStatus = await response.json();

    if (!serviceResponse.stellar?.status) {
      throw new StellarFundingAccountError();
    }
    if (!serviceResponse.pendulum?.status) {
      throw new PendulumFundingAccountError();
    }
    if (!serviceResponse.moonbeam?.status) {
      throw new MoonbeamFundingAccountError();
    }

    return {
      moonbeam: serviceResponse.moonbeam,
      pendulum: serviceResponse.pendulum,
      stellar: serviceResponse.stellar
    };
  } catch (error) {
    if (error instanceof SigningServiceError) {
      throw error;
    }
    console.error("Signing service is down: ", error);
    throw new SigningServiceError("Signing service is down");
  }
};

export const useSigningService = () => {
  return useQuery({
    queryFn: fetchSigningServiceAccountId,
    queryKey: ["signingService"],
    retry: (failureCount, error) => {
      if (
        error instanceof StellarFundingAccountError ||
        error instanceof PendulumFundingAccountError ||
        error instanceof MoonbeamFundingAccountError
      ) {
        return false;
      }
      return failureCount < 3;
    }
  });
};

export const fetchSep10Signatures = async ({
  challengeXDR,
  outToken,
  clientPublicKey,
  usesMemo,
  address
}: SignerServiceSep10Request): Promise<SignerServiceSep10Response> => {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`, {
    body: JSON.stringify({ address, challengeXDR, clientPublicKey, outToken, usesMemo }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (response.status !== 200) {
    if (response.status === 401) {
      throw new Error("Invalid signature");
    }
    throw new Error(`Failed to fetch SEP10 challenge from server: ${response.statusText}`);
  }

  const { clientSignature, clientPublic, masterClientSignature, masterClientPublic } = await response.json();
  return { clientPublic, clientSignature, masterClientPublic, masterClientSignature };
};

export const fetchKycStatus = async (taxId: string) => {
  const statusResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getKycStatus?taxId=${taxId}`);

  if (statusResponse.status !== 200) {
    throw new Error(`Failed to fetch KYC status from server: ${statusResponse.statusText}`);
  }

  const eventStatus: BrlaGetKycStatusResponse = await statusResponse.json();
  console.log(`Received event status: ${JSON.stringify(eventStatus)}`);
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
  taxId
}: CreateAveniaSubaccountRequest): Promise<{ subAccountId: string }> => {
  const accountCreationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/createSubaccount`, {
    body: JSON.stringify({ accountType, name, taxId }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });

  if (accountCreationResponse.status === 400) {
    const { details } = await accountCreationResponse.json();
    throw new SubaccountCreationRejectedError(details.error || "Sub-account creation was rejected.");
  }

  if (accountCreationResponse.status >= 500) {
    throw new SubaccountCreationNetworkError(
      `Failed to create sub-account due to a server error: ${accountCreationResponse.statusText}`
    );
  }

  if (accountCreationResponse.status !== 200) {
    throw new SubaccountCreationNetworkError(`Failed to create sub-account: ${accountCreationResponse.statusText}`);
  }

  return await accountCreationResponse.json();
};

export const submitNewKyc = async (kycData: KycLevel1Payload): Promise<{ id: string }> => {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/newKyc`, {
    body: JSON.stringify(kycData),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });

  if (response.status === 400) {
    const { details } = await response.json();
    throw new KycSubmissionRejectedError(details || "Submission was rejected.");
  }

  if (response.status >= 500) {
    throw new KycSubmissionNetworkError(`Failed to submit KYC due to a server error: ${response.statusText}`);
  }

  if (response.status !== 200) {
    throw new KycSubmissionNetworkError(`Failed to submit KYC: ${response.statusText}`);
  }

  return await response.json();
};
