import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { useTranslation } from "react-i18next";
import { useFiatToken, useOnChainToken } from "../../stores/quote/useQuoteFormStore";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { InterbankExchangeRate } from "../InterbankExchangeRate";
import { QuoteRefreshProgress } from "../QuoteRefreshProgress";

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
  totalFeeFiat: string
) {
  const inputAmount = Big(inputAmountString);
  const outputAmount = Big(outputAmountString);

  let effectiveInputAmount = inputAmount;
  let effectiveOutputAmount = outputAmount;

  if (rampType === RampDirection.BUY) {
    effectiveInputAmount = inputAmount.minus(totalFeeFiat);
  } else {
    effectiveOutputAmount = outputAmount.plus(totalFeeFiat);
  }

  return effectiveInputAmount.gt(0) ? effectiveOutputAmount.div(effectiveInputAmount).toNumber() : 0;
}

// Calculate all-in exchange rate
function calculateNetExchangeRate(inputAmountString: Big.BigSource, outputAmountString: Big.BigSource) {
  const inputAmount = Big(inputAmountString);
  const outputAmount = Big(outputAmountString);

  return inputAmount.gt(0) ? outputAmount.div(inputAmount).toNumber() : 0;
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
        anchorFeeFiat: "0",
        feeCurrency: fiatToken,
        inputAmount: 0,
        inputCurrency: rampDirection === RampDirection.BUY ? fiatToken : onChainToken,
        networkFeeFiat: "0",
        outputAmount: 0,
        outputCurrency: rampDirection === RampDirection.BUY ? onChainToken : fiatToken,
        partnerFeeFiat: "0",
        processingFeeFiat: "0",
        rampType: RampDirection.BUY,
        totalFeeFiat: "0",
        vortexFeeFiat: "0"
      };

  const inputCurrency = quote.inputCurrency.toUpperCase();
  const outputCurrency = quote.outputCurrency.toUpperCase();
  const interbankExchangeRate = calculateInterbankExchangeRate(
    quote.rampType,
    quote.inputAmount,
    quote.outputAmount,
    quote.totalFeeFiat || "0"
  );
  const netExchangeRate = calculateNetExchangeRate(quote.inputAmount, quote.outputAmount);

  // Generate fee items for display
  const feeItems: FeeItem[] = [];

  // Use the pre-calculated processing fee from the API
  if (Big(quote.processingFeeFiat || "0").gt(0)) {
    feeItems.push({
      label: t("components.feeCollapse.processingFee.label"),
      tooltip: t("components.feeCollapse.processingFee.tooltip"),
      value: `${Big(quote.processingFeeFiat).toFixed(2)} ${(quote.feeCurrency || fiatToken).toUpperCase()}`
    });
  }

  if (Big(quote.networkFeeFiat || "0").gt(0)) {
    feeItems.push({
      label: t("components.feeCollapse.networkFee.label"),
      tooltip: t("components.feeCollapse.networkFee.tooltip"),
      value: `${Big(quote.networkFeeFiat).toFixed(2)} ${(quote.feeCurrency || fiatToken).toUpperCase()}`
    });
  }

  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-center px-4">
        <InterbankExchangeRate inputCurrency={inputCurrency} outputCurrency={outputCurrency} rate={interbankExchangeRate} />
        <QuoteRefreshProgress />
      </div>
      <div className="collapse-arrow collapse overflow-visible border border-blue-700">
        <input type="checkbox" />
        <div className="collapse-title min-h-0 px-4 py-2">
          <div className="flex items-center justify-between">
            <p>{t("components.feeCollapse.details")}</p>
          </div>
        </div>
        <div className="collapse-content text-[15px]">
          {feeItems.map((item, index) => (
            <div className="mt-2 flex justify-between" key={index}>
              <div className="flex items-center ">
                {item.label}{" "}
                {item.tooltip && (
                  <div className="tooltip tooltip-primary tooltip-top tooltip-sm" data-tip={item.tooltip}>
                    <InformationCircleIcon className="ml-1 h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex">
                <span>{item.value}</span>
              </div>
            </div>
          ))}

          <div className="mt-2 flex justify-between border-t pt-2">
            <strong className="font-bold">{t("components.feeCollapse.totalFee")}</strong>
            <div className="flex">
              <span>
                {quote.totalFeeFiat} {(quote.feeCurrency || fiatToken).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <strong className="flex items-center font-bold">
              {t("components.feeCollapse.netRate.label")}
              <div
                className="tooltip tooltip-primary tooltip-top tooltip-sm font-normal"
                data-tip={t("components.feeCollapse.netRate.tooltip")}
              >
                <InformationCircleIcon className="ml-1 h-4 w-4" />
              </div>
            </strong>
            <div className="flex">
              <InterbankExchangeRate
                asSpan={true}
                className=""
                inputCurrency={inputCurrency}
                outputCurrency={outputCurrency}
                rate={netExchangeRate}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
