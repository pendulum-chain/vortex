import { SIGNING_SERVICE_URL } from '../constants/constants';

interface SigningServiceStatus {
  status: boolean;
  fundingPK: string;
}

export const fetchSigningServicePK = async (): Promise<string> => {
  try {
    const serviceResponse: SigningServiceStatus = await (await fetch(`${SIGNING_SERVICE_URL}/v1/status`)).json();

    if (serviceResponse.status == true) {
      return serviceResponse.fundingPK;
    }
    throw new Error('Could not fetch funding secret key or signing service is down');
  } catch {
    throw new Error('Could not fetch funding secret key or signing service is down');
  }
};
