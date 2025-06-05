import {
  BaseFiatTokenDetails,
  OnChainTokenDetails,
  TokenDetails,
  isFiatTokenDetails,
  isOnChainTokenDetails,
} from 'shared';

import { FiatTokenDetails } from 'shared';

export const getTokenSymbol = (token: BaseFiatTokenDetails | OnChainTokenDetails): string => {
  if (isFiatTokenDetails(token as TokenDetails)) {
    return (token as FiatTokenDetails).fiat.symbol;
  } else if (isOnChainTokenDetails(token as TokenDetails)) {
    return (token as OnChainTokenDetails).assetSymbol;
  }
  return '';
};
