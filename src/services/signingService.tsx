import { SIGNING_SERVICE_URL } from '../constants/constants';

interface PendulumFundingStatus {
  status: boolean;
  public: string;
}

interface StellarFundingStatus {
  status: boolean;
  public: string;
}
interface SigningServiceStatus {
  pendulum: PendulumFundingStatus;
  stellar: StellarFundingStatus;
}

export const fetchSigningServiceAccountId = async (): Promise<SigningServiceStatus> => {
  try {
    const serviceResponse: SigningServiceStatus = await (await fetch(`${SIGNING_SERVICE_URL}/v1/status`)).json();

    if (serviceResponse.stellar.status == true && serviceResponse.pendulum.status == true) {
      return { stellar: serviceResponse.stellar, pendulum: serviceResponse.pendulum };
    }
    throw new Error('Could not fetch funding secret key or signing service is down');
  } catch {
    throw new Error('Could not fetch funding secret key or signing service is down');
  }
};
