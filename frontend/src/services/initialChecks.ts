import { fetchSigningServiceAccountId } from './signingService';

export const initialChecks = async () => {
  // test signing service
  try {
    // this function returns only if all services are active and funded
    await fetchSigningServiceAccountId();
  } catch (error) {
    console.error('Initial check error: ', error);
    throw new Error('Cannot start offramp process safely');
  }
};
