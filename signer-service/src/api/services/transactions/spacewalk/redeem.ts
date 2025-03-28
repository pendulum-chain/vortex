import { StellarTokenDetails } from 'shared';
import { ApiManager } from '../../pendulum/apiManager';
import { createVaultService } from '../../stellar/vaultService';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';

interface SpacewalkRedeemParams {
  outputAmountRaw: string;
  stellarTargetAccountRaw: Buffer;
  outputTokenDetails: StellarTokenDetails;
  executeSpacewalkNonce: number;
}

export async function prepareSpacewalkRedeemTransaction({
  outputAmountRaw,
  stellarTargetAccountRaw,
  outputTokenDetails,
}: SpacewalkRedeemParams): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  try {
    const vaultService = await createVaultService(
      pendulumNode,
      outputTokenDetails.stellarAsset.code.hex,
      outputTokenDetails.stellarAsset.issuer.hex,
      outputAmountRaw,
    );

    const redeemExtrinsic = await vaultService.createRequestRedeemExtrinsic(outputAmountRaw, stellarTargetAccountRaw);

    return redeemExtrinsic;
  } catch (e) {
    throw Error("Couldn't create redeem extrinsic");
  }
}
