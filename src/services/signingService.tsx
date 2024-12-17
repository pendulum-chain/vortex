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

export interface SignerServiceSep10Request {
  challengeXDR: string;
  outToken: OutputTokenType;
  clientPublicKey: string;
  memo?: boolean;
}

// @todo: implement @tanstack/react-query
export const fetchSigningServiceAccountId = async (): Promise<SigningServiceStatus> => {
  try {
    console.log('awaiting serviceResponse');
    const serviceResponse: SigningServiceStatus = await (await fetch(`${SIGNING_SERVICE_URL}/v1/status`)).json();
    console.log('serviceResponse', serviceResponse);
    const allServicesActive = Object.values(serviceResponse).every((service: AccountStatusResponse) => service.status);

    if (allServicesActive) {
      return {
        stellar: serviceResponse.stellar,
        pendulum: serviceResponse.pendulum,
        moonbeam: serviceResponse.moonbeam,
      };
    }

    // we really want to throw for both cases: accounts not funded, or service down.
    throw new Error('One or more funding accounts are inactive');
  } catch (error) {
    console.error('Signing service is down: ', error);
    throw new Error('Signing service is down');
  }
};

export const fetchSep10Signatures = async ({
  challengeXDR,
  outToken,
  clientPublicKey,
  memo,
}: SignerServiceSep10Request): Promise<SignerServiceSep10Response> => {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/stellar/sep10`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ challengeXDR, outToken, clientPublicKey, memo }),
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
