import { ApiManager } from './polkadotApi';
import { Keyring } from '@polkadot/api';

export const checkPendulumAccount = async (secret: string): Promise<boolean> => {
  const apiManager = new ApiManager();
  const { api, ss58Format } = await apiManager.getApiComponents();

  try {
    const keyring = new Keyring({ type: 'sr25519' });
    keyring.setSS58Format(ss58Format);
    const origin = keyring.addFromUri(secret);
    const { data } = await api.query.system.account(origin.address);
    const freeBalance = data.free.toBigInt();
    if (freeBalance > 0) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Pendulum Account Error:', error);
    return false;
  }
};
