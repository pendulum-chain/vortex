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

interface ClientDomainSep10Response {
  clientSignature: string;
  clientPublic: string;
}

export const fetchSigningServiceAccountId = async (): Promise<SigningServiceStatus> => {
  try {
    const serviceResponse: SigningServiceStatus = await (await fetch(`${SIGNING_SERVICE_URL}/v1/status`)).json();

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

export const fetchClientDomainSep10 = async (
  challengeXDR: string,
  outToken: OutputTokenType,
): Promise<ClientDomainSep10Response> => {
  const response = await fetch(`http://localhost:3000/v1/stellar/sep10`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeXDR, outToken }),
  });
  if (response.status !== 200) {
    throw new Error(`Failed to fetch SEP10 challenge from server: ${response.statusText}`);
  }
  const { clientSignature, clientPublic } = await response.json();
  return { clientSignature, clientPublic };
};
