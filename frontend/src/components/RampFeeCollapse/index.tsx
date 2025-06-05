import { useTranslation } from 'react-i18next';
import Big from 'big.js';
import { useQuote } from '../../stores/ramp/useQuoteStore';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { QuoteEndpoints } from 'shared';

interface FeeItem {
  label: string;
  tooltip?: string;
  value: string;
}

// This function calculates the interbank exchange rate based on the quote response, neglecting any fees.
function calculateInterbankExchangeRate(
  rampType: string,
  inputAmountString: Big.BigSource,
  outputAmountString: Big.BigSource,
  fee: QuoteEndpoints.FeeStructure,
) {
  const inputAmount = Big(inputAmountString);
  const outputAmount = Big(outputAmountString);

  let effectiveInputAmount = inputAmount;
  let effectiveOutputAmount = outputAmount;

  if (rampType === 'on') {
    effectiveInputAmount = inputAmount.minus(fee.total);
  } else {
    effectiveOutputAmount = outputAmount.plus(fee.total);
  }

  return effectiveInputAmount.gt(0) ? effectiveOutputAmount.div(effectiveInputAmount).toNumber() : 0;
}

// Calculate all-in exchange rate
function calculateNetExchangeRate(inputAmountString: Big.BigSource, outputAmountString: Big.BigSource) {
  const inputAmount = Big(inputAmountString);
  const outputAmount = Big(outputAmountString);

  return inputAmount.gt(0) ? outputAmount.div(inputAmount).toNumber() : 0;
}

// Helper function to format exchange rate strings
function formatExchangeRateString(rate: number, input: string, output: string) {
  return `1 ${input} ≈ ${rate.toFixed(4)} ${output}`;
}

export function RampFeeCollapse() {
  const { t } = useTranslation();

  const availableQuote = useQuote();

  const rampDirection = useRampDirection();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();

  const quote = availableQuote
    ? availableQuote
    : {
        rampType: 'on',
        inputAmount: 0,
        outputAmount: 0,
        inputCurrency: rampDirection === RampDirection.ONRAMP ? fiatToken : onChainToken,
        outputCurrency: rampDirection === RampDirection.ONRAMP ? onChainToken : fiatToken,
        fee: { total: '0', network: '0', vortex: '0', anchor: '0', partnerMarkup: '0', currency: fiatToken },
      };

  const inputCurrency = quote.inputCurrency.toUpperCase();
  const outputCurrency = quote.outputCurrency.toUpperCase();
  const interbankExchangeRate = calculateInterbankExchangeRate(
    quote.rampType,
    quote.inputAmount,
    quote.outputAmount,
    quote.fee,
  );
  const netExchangeRate = calculateNetExchangeRate(quote.inputAmount, quote.outputAmount);

  // Generate fee items for display
  const feeItems: FeeItem[] = [];

  // Combine Vortex, Anchor, and Partner Markup fees into a single processing fee
  const processingFee = Big(quote.fee.vortex).plus(quote.fee.anchor).plus(quote.fee.partnerMarkup);
  if (processingFee.gt(0)) {
    feeItems.push({
      label: t('components.feeCollapse.processingFee.label'),
      tooltip: t('components.feeCollapse.processingFee.tooltip'),
      value: `${processingFee.toFixed(2)} ${quote.fee.currency.toUpperCase()}`,
    });
  }

  if (Big(quote.fee.network).gt(0)) {
    feeItems.push({
      label: t('components.feeCollapse.networkFee.label'),
      tooltip: t('components.feeCollapse.networkFee.tooltip'),
      value: `${Big(quote.fee.network).toFixed(2)} ${quote.fee.currency.toUpperCase()}`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-sm text-gray-600">
        {formatExchangeRateString(interbankExchangeRate, inputCurrency, outputCurrency)}
      </div>
      <div className="border border-blue-700 collapse-arrow collapse overflow-visible">
        <input type="checkbox" />
        <div className="min-h-0 px-4 py-2 collapse-title">
          <div className="flex items-center justify-between">
            <p>{t('components.feeCollapse.details')}</p>
          </div>
        </div>
        <div className="text-[15px] collapse-content">
          {feeItems.map((item, index) => (
            <div key={index} className="flex justify-between mt-2">
              <div
                className="flex items-center tooltip tooltip-primary tooltip-top before:whitespace-pre-wrap before:content-[attr(data-tip)]"
                data-tip={item.tooltip}
              >
                {item.label} {item.tooltip && <InformationCircleIcon className="w-4 h-4 ml-1" />}
              </div>
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
          <div className="flex justify-between pt-2">
            <div
              className="tooltip tooltip-primary tooltip-top before:whitespace-pre-wrap before:content-[attr(data-tip)]"
              data-tip={t('components.feeCollapse.netRate.tooltip')}
            >
              <strong className="flex items-center font-bold">
                {t('components.feeCollapse.netRate.label')} <InformationCircleIcon className="w-4 h-4 ml-1" />
              </strong>
            </div>
            <div className="flex">
              <span>{formatExchangeRateString(netExchangeRate, inputCurrency, outputCurrency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
