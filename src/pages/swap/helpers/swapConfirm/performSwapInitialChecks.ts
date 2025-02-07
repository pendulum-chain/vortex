import { ApiPromise } from '@polkadot/api';

import {
  InputTokenDetails,
  isStellarOutputTokenDetails,
  OutputTokenDetailsMoonbeam,
  OutputTokenDetailsSpacewalk,
} from '../../../../constants/tokenConfig';
import { getVaultsForCurrency } from '../../../../services/phases/polkadot/spacewalk';
import { testRoute } from '../../../../services/phases/squidrouter/route';
import { Networks } from '../../../../helpers/networks';

export const performSwapInitialChecks = async (
  api: ApiPromise,
  outputToken: OutputTokenDetailsMoonbeam | OutputTokenDetailsSpacewalk,
  fromToken: InputTokenDetails,
  expectedRedeemAmountRaw: string,
  inputAmountRaw: string,
  address: string,
  requiresSquidRouter: boolean,
  selectedNetwork: Networks,
) => {
  if (isStellarOutputTokenDetails(outputToken)) {
    await Promise.all([
      getVaultsForCurrency(
        api,
        (outputToken as OutputTokenDetailsSpacewalk).stellarAsset.code.hex,
        (outputToken as OutputTokenDetailsSpacewalk).stellarAsset.issuer.hex,
        expectedRedeemAmountRaw,
      ),
      requiresSquidRouter ? testRoute(fromToken, inputAmountRaw, address, selectedNetwork) : Promise.resolve(),
    ]);
  } else {
    await (requiresSquidRouter ? testRoute(fromToken, inputAmountRaw, address, selectedNetwork) : Promise.resolve());
  }
};
