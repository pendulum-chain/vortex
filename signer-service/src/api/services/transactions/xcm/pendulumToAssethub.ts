import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { PendulumCurrencyId } from '../../../../config/tokens';
import { ApiManager } from '../../pendulum/apiManager';

export async function createPendulumToAssethubTransfer(
  destinationAddress: string,
  currencyId: PendulumCurrencyId,
  rawAmount: string,
): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
  const destination = {
    V3: {
      parents: 1,
      interior: { X2: [{ Parachain: 1000 }, { AccountKey20: { network: undefined, key: destinationAddress } }] },
    },
  };

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const { api: pendulumApi } = pendulumNode;

  return pendulumApi.tx.xTokens.transfer(currencyId, rawAmount, destination, 'Unlimited');
}
