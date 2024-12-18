import { ApiPromise } from '@polkadot/api';

import { InputTokenDetails, OutputTokenDetails } from '../../../../constants/tokenConfig';
import { getVaultsForCurrency } from '../../../../services/phases/polkadot/spacewalk';
import { testRoute } from '../../../../services/phases/squidrouter/route';
import { Networks } from '../../../../contexts/network';

export const performSwapInitialChecks = async (
  api: ApiPromise,
  outputToken: OutputTokenDetails,
  fromToken: InputTokenDetails,
  expectedRedeemAmountRaw: string,
  inputAmountRaw: string,
  address: string,
  requiresSquidRouter: boolean,
  network: Networks,
) => {
  await Promise.all([
    getVaultsForCurrency(
      api,
      outputToken.stellarAsset.code.hex,
      outputToken.stellarAsset.issuer.hex,
      expectedRedeemAmountRaw,
    ),
    requiresSquidRouter ? testRoute(fromToken, inputAmountRaw, address, network) : Promise.resolve(),
  ]);
};
