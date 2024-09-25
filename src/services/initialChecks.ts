import { isSigningServiceOperational } from './signingService';

export const initialChecks = async () => {
  // test signing service
  try {
    await isSigningServiceOperational();
  } catch (error) {
    console.error('Initial check error: ', error);
    throw new Error('Cannot start offramp process safely');
  }
};
