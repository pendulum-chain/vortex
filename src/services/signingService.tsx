import { useQuery } from '@tanstack/react-query';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { OutputTokenType } from '../constants/tokenConfig';

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

type BrlaOfframpState = 'BURN' | 'MONEY-TRANSFER';
type OfframpStatus = 'QUEUED' | 'POSTED' | 'SUCCESS' | 'FAILED';

type BrlaKycState = 'KYC';

export enum KycStatus {
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  APPROVED = 'APPROVED',
}

export type KycStatusType = keyof typeof KycStatus;

interface BrlaOfframpStatus {
  type: BrlaOfframpState;
  status: OfframpStatus;
}

interface BrlaKycStatus {
  type: BrlaKycState;
  status: KycStatusType;
}

type TaxIdType = 'CPF' | 'CNPJ';

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
  birthdate: number; // Denoted in milliseconds since epoch
}

export interface SignerServiceSep10Request {
  challengeXDR: string;
  outToken: OutputTokenType;
  clientPublicKey: string;
  address: string;
  usesMemo?: boolean;
}

// Generic error for signing service
export class SigningServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningServiceError';
  }
}

// Specific errors for each funding account
export class StellarFundingAccountError extends SigningServiceError {
  constructor() {
    super('Stellar account is inactive');
    this.name = 'StellarFundingAccountError';
  }
}

export class PendulumFundingAccountError extends SigningServiceError {
  constructor() {
    super('Pendulum account is inactive');
    this.name = 'PendulumFundingAccountError';
  }
}

export class MoonbeamFundingAccountError extends SigningServiceError {
  constructor() {
    super('Moonbeam account is inactive');
    this.name = 'MoonbeamFundingAccountError';
  }
}

export const fetchSigningServiceAccountId = async (): Promise<SigningServiceStatus> => {
  try {
    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/status`);
    if (!response.ok) {
      throw new SigningServiceError('Failed to fetch signing service status');
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
      stellar: serviceResponse.stellar,
      pendulum: serviceResponse.pendulum,
      moonbeam: serviceResponse.moonbeam,
    };
  } catch (error) {
    if (error instanceof SigningServiceError) {
      throw error;
    }
    console.error('Signing service is down: ', error);
    throw new SigningServiceError('Signing service is down');
  }
};

export const useSigningService = () => {
  return useQuery({
    queryKey: ['signingService'],
    queryFn: fetchSigningServiceAccountId,
    retry: (failureCount, error) => {
      if (
        error instanceof StellarFundingAccountError ||
        error instanceof PendulumFundingAccountError ||
        error instanceof MoonbeamFundingAccountError
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

export const fetchSep10Signatures = async ({
  challengeXDR,
  outToken,
  clientPublicKey,
  usesMemo,
  address,
}: SignerServiceSep10Request): Promise<SignerServiceSep10Response> => {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ challengeXDR, outToken, clientPublicKey, usesMemo, address }),
  });
  if (response.status !== 200) {
    if (response.status === 401) {
      throw new Error('Invalid signature');
    }
    throw new Error(`Failed to fetch SEP10 challenge from server: ${response.statusText}`);
  }

  const { clientSignature, clientPublic, masterClientSignature, masterClientPublic } = await response.json();
  return { clientSignature, clientPublic, masterClientSignature, masterClientPublic };
};

export const fetchOfframpStatus = async (taxId: string) => {
  const statusResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getOfframpStatus?taxId=${taxId}`);

  if (statusResponse.status !== 200) {
    if (statusResponse.status === 404) {
      throw new Error('Offramp not found');
    } else {
      throw new Error(`Failed to fetch offramp status from server: ${statusResponse.statusText}`);
    }
  }

  const eventStatus: BrlaOfframpStatus = await statusResponse.json();
  console.log(`Received event status: ${JSON.stringify(eventStatus)}`);
  return eventStatus;
};

export const fetchKycStatus = async (taxId: string) => {
  const statusResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getKycStatus?taxId=${taxId}`);

  if (statusResponse.status !== 200) {
    throw new Error(`Failed to fetch KYC status from server: ${statusResponse.statusText}`);
  }

  const eventStatus: BrlaKycStatus = await statusResponse.json();
  console.log(`Received event status: ${JSON.stringify(eventStatus)}`);
  return eventStatus;
};

export const createSubaccount = async (kycData: RegisterSubaccountPayload): Promise<{ subaccountId: string }> => {
  const accountCreationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/createSubaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(kycData),
  });

  if (accountCreationResponse.status === 400) {
    const { details } = await accountCreationResponse.json();
    throw new Error('Failed to create user. Reason: ' + details.error);
  }

  if (accountCreationResponse.status !== 200) {
    throw new Error(`Failed to fetch KYC status from server: ${accountCreationResponse.statusText}`);
  }

  return await accountCreationResponse.json();
};
