import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { StellarTokenDetails } from 'shared';
import { ApiManager } from '../../pendulum/apiManager';
import { createVaultService } from '../../stellar/vaultService';

interface SpacewalkRedeemParams {
  outputAmountRaw: string;
  stellarEphemeralAccountRaw: Buffer;
  outputTokenDetails: StellarTokenDetails;
  executeSpacewalkNonce: number;
}

export async function prepareSpacewalkRedeemTransaction({
  outputAmountRaw,
  stellarEphemeralAccountRaw,
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

    const redeemExtrinsic = await vaultService.createRequestRedeemExtrinsic(
      outputAmountRaw,
      stellarEphemeralAccountRaw,
    );

    return redeemExtrinsic;
  } catch (_e) {
    throw Error("Couldn't create redeem extrinsic");
  }
}
