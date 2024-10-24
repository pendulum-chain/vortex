import { SIGNING_SERVICE_URL } from '../constants/constants';

interface AccountStatusResponse {
  status: boolean;
  public: string;
}
interface SigningServiceStatus {
  pendulum: AccountStatusResponse;
  stellar: AccountStatusResponse;
  moonbeam: AccountStatusResponse;
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
