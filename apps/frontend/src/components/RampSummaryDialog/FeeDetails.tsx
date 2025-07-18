import { FiatTokenDetails, isFiatTokenDetails, OnChainTokenDetails, QuoteFeeStructure } from "@packages/shared";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { InterbankExchangeRate } from "../InterbankExchangeRate";
import { RampDirection } from "../RampToggle";

interface FeeDetailsProps {
  feesCost: QuoteFeeStructure;
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
  destinationAddress
}) => {
  const { t } = useTranslation();

  const isOfframp = direction === RampDirection.OFFRAMP;

  const fiatToken = (isOfframp ? toToken : fromToken) as FiatTokenDetails;
  if (!isFiatTokenDetails(fiatToken)) {
    throw new Error("Invalid fiat token details");
  }
  const inputCurrency = isOfframp ? fromToken.assetSymbol : fiatToken.fiat.symbol;
  const outputCurrency = isOfframp ? fiatToken.fiat.symbol : toToken.assetSymbol;

  return (
    <section className="mt-6">
      <div className="mb-2 flex justify-between">
        <p>
          {isOfframp
            ? t("components.dialogs.RampSummaryDialog.offrampFee")
            : t("components.dialogs.RampSummaryDialog.onrampFee")}{" "}
        </p>
        <p className="flex items-center gap-2">
          <strong>
            {feesCost.total} {feesCost.currency.toUpperCase()}
          </strong>
        </p>
      </div>
      <div className="mb-2 flex justify-between">
        <p>{t("components.dialogs.RampSummaryDialog.quote")}</p>
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
          <p>{t("components.dialogs.RampSummaryDialog.destination")}</p>
          {destinationAddress}
        </div>
      )}
      <div className="flex justify-between">
        <p>{t("components.dialogs.RampSummaryDialog.partner")}</p>
        <a className="text-blue-500 hover:underline" href={partnerUrl} rel="noopener noreferrer" target="_blank">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};
