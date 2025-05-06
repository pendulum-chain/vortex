import { useTranslation } from 'react-i18next';
import Big from 'big.js';
import { useQuote } from '../../stores/ramp/useQuoteStore';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';

interface FeeItem {
  label: string;
  value: string;
}

export function RampFeeCollapse() {
  const { t } = useTranslation();

  const availableQuote = useQuote();

  const rampDirection = useRampDirection()
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();

  const quote = availableQuote
    ? availableQuote
    : {
        inputAmount: 0,
        outputAmount: 0,
        inputCurrency: rampDirection === RampDirection.ONRAMP ? fiatToken : onChainToken,
        outputCurrency: rampDirection === RampDirection.ONRAMP ? onChainToken : fiatToken,
        fee: { total: 0, network: 0, vortex: 0, anchor: 0, partnerMarkup: 0, currency: fiatToken },
      };

  // Calculate exchange rate
  const inputAmount = Big(quote.inputAmount);
  const outputAmount = Big(quote.outputAmount);
  const inputCurrency = quote.inputCurrency.toUpperCase();
  const outputCurrency = quote.outputCurrency.toUpperCase();

  // Calculate exchange rate (how much outputCurrency you get for 1 inputCurrency)
  const exchangeRate = inputAmount.gt(0) ? outputAmount.div(inputAmount).toNumber() : 0;

  // Generate fee items for display
  const feeItems: FeeItem[] = [];

  // Combine Vortex and anchor fee to processing fee
  const processingFee = Big(quote.fee.vortex).plus(quote.fee.anchor);
  if (processingFee.gt(0)) {
    feeItems.push({
      label: t('components.feeCollapse.vortexFee'),
      value: `${processingFee.toFixed(2)} ${quote.fee.currency.toUpperCase()}`,
    });
  }

  if (Big(quote.fee.partnerMarkup).gt(0)) {
    feeItems.push({
      label: t('components.feeCollapse.partnerMarkupFee'),
      value: `${Big(quote.fee.partnerMarkup).toFixed(2)} ${quote.fee.currency.toUpperCase()}`,
    });
  }

  if (Big(quote.fee.network).gt(0)) {
    feeItems.push({
      label: t('components.feeCollapse.networkFee'),
      value: `${Big(quote.fee.network).toFixed(2)} ${quote.fee.currency.toUpperCase()}`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-sm text-gray-600">
        {`1 ${inputCurrency} ≈ ${exchangeRate.toFixed(4)} ${outputCurrency}`}
      </div>
      <div className="border border-blue-700 collapse-arrow collapse">
        <input type="checkbox" />
        <div className="min-h-0 px-4 py-2 collapse-title">
          <div className="flex items-center justify-between">
            <p>{t('components.feeCollapse.details')}</p>
          </div>
        </div>
        <div className="text-[15px] collapse-content">
          {feeItems.map((item, index) => (
            <div key={index} className="flex justify-between mt-2">
              <p>{item.label}</p>
              <div className="flex">
                <span>{item.value}</span>
              </div>
            </div>
          ))}

          <div className="flex justify-between mt-2 pt-2 border-t">
            <strong className="font-bold">{t('components.feeCollapse.totalFee')}</strong>
            <div className="flex">
              <span>
                {quote.fee.total} {quote.fee.currency.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
