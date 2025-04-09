import { FC, JSX } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { OnChainTokenDetails, FiatTokenDetails } from 'shared';
import { useEventsContext } from '../../contexts/events';
import { useOfframpFees } from '../../hooks/useOfframpFees';
import { getTokenSymbol } from '../../helpers/getTokenSymbol';

interface CollapseProps {
  fromAmount?: string;
  toAmount?: Big;
  toToken: FiatTokenDetails | OnChainTokenDetails;
  exchangeRate?: JSX.Element;
}

export const FeeCollapse: FC<CollapseProps> = ({ toAmount = Big(0), toToken, exchangeRate }) => {
  const { trackEvent } = useEventsContext();

const { t } = useTranslation();
  const toTokenSymbol = getTokenSymbol(toToken);

  const trackFeeCollapseOpen = () => {
    trackEvent({ event: 'click_details' });
  };

  const { toAmountFixed, totalReceiveFormatted, feesCost } = useOfframpFees({
    toAmount,
    toToken,
  });

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
            {t('components.feeCollapse.yourQuote')} ({exchangeRate})
          </p>
          <div className="flex">
            <span>
              {toAmountFixed} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <p>{t('components.feeCollapse.vortexFee')}</p>
          <div className="flex">
            <span>
              - {feesCost} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <strong className="font-bold">{t('components.feeCollapse.finalAmount')}</strong>
          <div className="flex">
            <span>
              {totalReceiveFormatted} {toTokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
