import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { FiatTokenDetails, isFiatTokenDetails, Networks, OnChainTokenDetails } from 'shared';

import { ExchangeRate } from '../ExchangeRate';
import { NetworkIcon } from '../NetworkIcon';
import { RampDirection } from '../RampToggle';

interface FeeDetailsProps {
  network: Networks;
  feesCost: string;
  fiatSymbol: string;
  exchangeRate: string;
  fromToken: OnChainTokenDetails | FiatTokenDetails;
  toToken: OnChainTokenDetails | FiatTokenDetails;
  partnerUrl: string;
  direction: RampDirection;
}

export const FeeDetails: FC<FeeDetailsProps> = ({
  network,
  feesCost,
  fiatSymbol,
  fromToken,
  toToken,
  exchangeRate,
  partnerUrl,
  direction,
}) => {
  const { t } = useTranslation();

  const isOfframp = direction === RampDirection.OFFRAMP;

  const fiatToken = (isOfframp ? toToken : fromToken) as FiatTokenDetails;
  if (!isFiatTokenDetails(fiatToken)) {
    throw new Error('Invalid fiat token details');
  }

  return (
    <section className="mt-6">
      <div className="flex justify-between mb-2">
        <p>
          {isOfframp
            ? t('components.dialogs.RampSummaryDialog.offrampFee')
            : t('components.dialogs.RampSummaryDialog.onrampFee')}{' '}
          ({`${fiatToken.offrampFeesBasisPoints / 100}%`}
          {fiatToken.offrampFeesFixedComponent ? ` + ${fiatToken.offrampFeesFixedComponent} ${fiatSymbol}` : ''})
        </p>
        <p className="flex items-center gap-2">
          <NetworkIcon network={network} className="w-4 h-4" />
          <strong>
            {feesCost} {(toToken as OnChainTokenDetails).assetSymbol}
          </strong>
        </p>
      </div>
      <div className="flex justify-between mb-2">
        <p>{t('components.dialogs.RampSummaryDialog.quote')}</p>
        <p>
          <ExchangeRate
            inputToken={isOfframp ? fromToken : toToken}
            outputToken={isOfframp ? toToken : fromToken}
            exchangeRate={Number(exchangeRate)}
          />
        </p>
      </div>
      <div className="flex justify-between">
        <p>{t('components.dialogs.RampSummaryDialog.partner')}</p>
        <a href={partnerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};
