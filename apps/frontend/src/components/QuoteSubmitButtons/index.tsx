import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useRampValidation } from "../../hooks/ramp/useRampValidation";
import { useQuoteStore } from "../../stores/ramp/useQuoteStore";
import { useInputAmount } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { Spinner } from "../Spinner";

export const QuoteSubmitButtons: FC = () => {
  const { t } = useTranslation();
  const { getCurrentErrorMessage } = useRampValidation();
  const rampDirection = useRampDirection(); // XSTATE: maybe move into state.

  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();
  const quoteInputAmount = quote?.inputAmount;

  const isQuoteOutdated =
    (!!quoteInputAmount && !!inputAmount && !Big(quoteInputAmount).eq(Big(inputAmount))) || quote?.rampType !== rampDirection;
  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !quote || isQuoteOutdated;

  const getButtonState = (): string => {
    if (rampDirection === RampDirection.BUY) {
      return t("components.quoteSubmitButton.buy");
    } else {
      return t("components.quoteSubmitButton.sell");
    }
  };

  const onClick = () => {
    // Pass the quote ID to the widget page
    const quoteId = quote?.id;
    if (quoteId) {
      window.location.href = `/widget?quoteId=${quoteId}`;
    }
  };

  return (
    <div className="mt-5 flex gap-3">
      <button className="btn-vortex-primary btn w-full" disabled={isSubmitButtonDisabled} onClick={onClick}>
        {isQuoteOutdated && <Spinner />}
        {getButtonState()}
      </button>
    </div>
  );
};
