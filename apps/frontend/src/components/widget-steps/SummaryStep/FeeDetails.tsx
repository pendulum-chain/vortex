import { FiatTokenDetails, isFiatTokenDetails, OnChainTokenDetails, QuoteFeeStructure, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { InterbankExchangeRate } from "../../InterbankExchangeRate";

interface FeeDetailsProps {
  feesCost: QuoteFeeStructure;
  exchangeRate: string;
  discount?: {
    amount: string;
    currency: string;
  };
  fromToken: OnChainTokenDetails | FiatTokenDetails;
  toToken: OnChainTokenDetails | FiatTokenDetails;
  partnerUrl: string;
  direction: RampDirection;
  destinationAddress?: string;
  iban?: string;
}

export const FeeDetails: FC<FeeDetailsProps> = ({
  feesCost,
  fromToken,
  toToken,
  exchangeRate,
  discount,
  partnerUrl,
  direction,
  destinationAddress,
  iban
}) => {
  const { t } = useTranslation();

  const isOfframp = direction === RampDirection.SELL;

  const fiatToken = (isOfframp ? toToken : fromToken) as FiatTokenDetails;
  if (!isFiatTokenDetails(fiatToken)) {
    throw new Error("Invalid fiat token details");
  }
  const inputCurrency = isOfframp ? fromToken.assetSymbol : fiatToken.fiat.symbol;
  const outputCurrency = isOfframp ? fiatToken.fiat.symbol : toToken.assetSymbol;
  const effectiveTotalFee = Big(feesCost.total || "0")
    .minus(discount?.amount || "0")
    .toFixed(2);

  return (
    <section className="mt-6">
      <div className="mb-2 flex justify-between">
        <p>{isOfframp ? t("components.SummaryPage.offrampFee") : t("components.SummaryPage.onrampFee")} </p>
        <p className="flex items-center gap-2">
          <strong>
            {effectiveTotalFee} {feesCost.currency.toUpperCase()}
          </strong>
        </p>
      </div>
      {discount && (
        <div className="mb-2 flex justify-between">
          <p>{t("components.feeCollapse.discount.label")}</p>
          <p className="flex items-center gap-2">
            <strong>
              - {discount.amount} {discount.currency.toUpperCase()}
            </strong>
          </p>
        </div>
      )}
      <div className="mb-2 flex justify-between">
        <p>{t("components.SummaryPage.quote")}</p>
        <p>
          <InterbankExchangeRate
            asSpan={true}
            inputCurrency={inputCurrency}
            outputCurrency={outputCurrency}
            rate={Number(exchangeRate)}
          />
        </p>
      </div>
      {destinationAddress && (
        <div className="mb-2 flex justify-between">
          <p>{isOfframp ? t("components.SummaryPage.source") : t("components.SummaryPage.destination")}</p>
          {destinationAddress}
        </div>
      )}
      {iban && (
        <div className="mb-2 flex justify-between">
          <p>{t("components.SummaryPage.iban")}</p>
          <p className="font-medium">{iban}</p>
        </div>
      )}
      <div className="flex justify-between">
        <p>{t("components.SummaryPage.partner")}</p>
        <a className="text-blue-500 hover:underline" href={partnerUrl} rel="noopener noreferrer" target="_blank">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};
