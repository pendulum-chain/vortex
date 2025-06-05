import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { FiatTokenDetails, Networks, OnChainTokenDetails, QuoteEndpoints, isFiatTokenDetails } from 'shared';

import { ExchangeRate } from '../ExchangeRate';
import { RampDirection } from '../RampToggle';

interface FeeDetailsProps {
  feesCost: QuoteEndpoints.FeeStructure;
  exchangeRate: string;
  fromToken: OnChainTokenDetails | FiatTokenDetails;
  toToken: OnChainTokenDetails | FiatTokenDetails;
  partnerUrl: string;
  direction: RampDirection;
  destinationAddress?: string;
}

export const FeeDetails: FC<FeeDetailsProps> = ({
  feesCost,
  fromToken,
  toToken,
  exchangeRate,
  partnerUrl,
  direction,
  destinationAddress,
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
        </p>
        <p className="flex items-center gap-2">
          <strong>
            {feesCost.total} {feesCost.currency.toUpperCase()}
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
      {destinationAddress && (
        <div className="flex justify-between mb-2">
          <p>{t('components.dialogs.RampSummaryDialog.destination')}</p>
          {destinationAddress}
        </div>
      )}
      <div className="flex justify-between">
        <p>{t('components.dialogs.RampSummaryDialog.partner')}</p>
        <a href={partnerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};
