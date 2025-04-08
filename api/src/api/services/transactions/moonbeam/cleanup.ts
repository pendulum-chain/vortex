import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { getAddressForFormat } from 'shared';
import { ApiManager } from '../../pendulum/apiManager';
import { getFundingAccount } from '../../../controllers/subsidize.controller';

export async function prepareMoonbeamCleanupTransaction(): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = 'moonbeam';
  const moonbeamNode = await apiManager.getApi(networkName);

  const fundingAccountKeypair = getFundingAccount();
  const fundingAccountAddress = getAddressForFormat(fundingAccountKeypair.address, moonbeamNode.ss58Format);

  return moonbeamNode.api.tx.balances.transferAll(fundingAccountAddress, false);
}
