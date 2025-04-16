import { FC, JSX } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { FiatTokenDetails, OnChainTokenDetails } from 'shared';
import { useEventsContext } from '../../contexts/events';
import { getTokenSymbol } from '../../helpers/getTokenSymbol';

interface CollapseProps {
  toAmount: Big;
  toToken: FiatTokenDetails | OnChainTokenDetails;
  exchangeRateBeforeFees: JSX.Element;
  fee: Big.Big;
}

export const FeeCollapse: FC<CollapseProps> = ({ toAmount, toToken, exchangeRateBeforeFees, fee }) => {
  const { trackEvent } = useEventsContext();

  const { t } = useTranslation();
  const toTokenSymbol = getTokenSymbol(toToken);

  const trackFeeCollapseOpen = () => {
    trackEvent({ event: 'click_details' });
  };

  return (
    <div className="border border-blue-700 collapse-arrow collapse" onClick={trackFeeCollapseOpen}>
      <input type="checkbox" />
      <div className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>{t('components.feeCollapse.details')}</p>
        </div>
      </div>
      <div className="text-[15px] collapse-content">
        <div className="flex justify-between mt-2 ">
          <p>
            {t('components.feeCollapse.yourQuote')} ({exchangeRateBeforeFees})
          </p>
          <div className="flex">
            <span>
              {toAmount.plus(fee).toFixed(2)} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <p>{t('components.feeCollapse.vortexFee')}</p>
          <div className="flex">
            <span>
              - {fee.toFixed(2)} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <strong className="font-bold">{t('components.feeCollapse.finalAmount')}</strong>
          <div className="flex">
            <span>
              {toAmount.toFixed(2)} {toTokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
