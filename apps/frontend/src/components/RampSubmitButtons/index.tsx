import { useSelector } from "@xstate/react";
import Big from "big.js";
import { FC, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEventsContext } from "../../contexts/events";
import { useRampActor } from "../../contexts/rampState";
import { useRampValidation } from "../../hooks/ramp/useRampValidation";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { useFeeComparisonStore } from "../../stores/feeComparison";
import { useQuoteStore } from "../../stores/ramp/useQuoteStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useRampExecutionInput } from "../../stores/rampStore";
import { SwapSubmitButton } from "../buttons/SwapSubmitButton";
import { RampDirection } from "../RampToggle";

interface RampSubmitButtonsProps {
  toAmount?: Big;
}

export const RampSubmitButtons: FC<RampSubmitButtonsProps> = ({ toAmount }) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { feeComparisonRef } = useFeeComparisonStore();
  const { trackEvent } = useEventsContext();
  const { getCurrentErrorMessage } = useRampValidation();
  const executionInput = useRampExecutionInput();

  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const rampDirection = useRampDirection(); // XSTATE: maybe move into state.
  const isWidgetMode = useWidgetMode();

  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();
  const quoteInputAmount = quote?.inputAmount;

  const { isRampSummaryDialogVisible, initializeFailedMessage } = useSelector(rampActor, state => ({
    initializeFailedMessage: state.context.initializeFailedMessage,
    isRampSummaryDialogVisible: state.context.rampSummaryVisible
  }));

  const handleCompareFeesClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setTimeout(() => {
        feeComparisonRef?.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);

      trackEvent({
        event: "compare_quote",
        from_amount: inputAmount?.toString() || "0",
        from_asset: rampDirection === RampDirection.OFFRAMP ? onChainToken : fiatToken,
        to_amount: toAmount?.toString() || "0",
        to_asset: rampDirection === RampDirection.OFFRAMP ? fiatToken : onChainToken
      });
    },
    [trackEvent, rampDirection, fiatToken, onChainToken, inputAmount, toAmount, feeComparisonRef]
  );

  const getButtonState = (): string => {
    if (isRampSummaryDialogVisible) {
      return t("components.swapSubmitButton.processing");
    }
    return t("components.swapSubmitButton.confirm");
  };

  const isQuoteOutdated = !!quoteInputAmount && !!inputAmount && !Big(quoteInputAmount).eq(Big(inputAmount));
  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !toAmount || !!initializeFailedMessage || isQuoteOutdated;
  const isSubmitButtonPending = isRampSummaryDialogVisible || Boolean(executionInput) || isQuoteOutdated;

  return (
    <div className="mt-5 flex gap-3">
      {!isWidgetMode && (
        <button
          className="btn-vortex-primary-inverse btn"
          onClick={handleCompareFeesClick}
          style={{ flex: "1 1 calc(50% - 0.75rem/2)" }}
        >
          {t("components.swap.compareFees")}
        </button>
      )}
      <SwapSubmitButton disabled={isSubmitButtonDisabled} pending={isSubmitButtonPending} text={getButtonState()} />
    </div>
  );
};
