import { ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { FiatToken, isAlfredpayToken, RampDirection } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { useGetRampRegistrationErrorMessage } from "../../../hooks/offramp/useRampService/useRegisterRamp/helpers";
import { useSigningBoxState } from "../../../hooks/useSigningBoxState";
import { useRampSummaryActions } from "../../../stores/rampSummary";
import { AlertBanner } from "../../AlertBanner";
import { MenuButtons } from "../../MenuButtons";
import { RampSubmitButton } from "../../RampSubmitButton/RampSubmitButton";
import { SigningBoxButton, SigningBoxContent } from "../../SigningBox/SigningBoxContent";
import { StepFooter } from "../../StepFooter";
import { FiatAccountSelector } from "./FiatAccountSelector";
import { TransactionTokensDisplay } from "./TransactionTokensDisplay";

export const SummaryStep: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { setDialogScrollRef, scrollToBottom } = useRampSummaryActions();

  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  const { visible, executionInput, rampDirection, rampState, rampRegistrationError } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput,
    rampDirection: state.context.rampDirection,
    rampRegistrationError: state.context.initializeFailedMessage,
    rampState: state.context.rampState,
    visible:
      state.matches("KycComplete") || state.matches("RegisterRamp") || state.matches("UpdateRamp") || state.matches("StartRamp")
  }));
  const rampType = rampDirection || RampDirection.BUY;
  const isOnramp = rampType === RampDirection.BUY;

  const dialogScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDialogScrollRef(dialogScrollRef);
    return () => {
      setDialogScrollRef(null);
    };
  }, [setDialogScrollRef]);

  useEffect(() => {
    if (!visible || !isOnramp) return;
    const fiatToken = executionInput?.fiatToken;
    const isBrlReady = fiatToken === FiatToken.BRL && rampState?.ramp?.depositQrCode;
    const isEurcReady = fiatToken === FiatToken.EURC && rampState?.ramp?.ibanPaymentData;
    if (isBrlReady || isEurcReady) {
      scrollToBottom();
    }
  }, [
    visible,
    isOnramp,
    executionInput?.fiatToken,
    rampState?.ramp?.depositQrCode,
    rampState?.ramp?.ibanPaymentData,
    scrollToBottom
  ]);

  const getRampRegistrationErrorMessage = useGetRampRegistrationErrorMessage();

  if (!visible) return null;
  if (!executionInput) return null;

  const rampRegistrationErrorMessage = getRampRegistrationErrorMessage(rampRegistrationError);

  const headerText = isOnramp ? t("components.SummaryPage.headerText.buy") : t("components.SummaryPage.headerText.sell");

  const actions = signingBoxVisible ? (
    <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
  ) : (
    <RampSubmitButton />
  );

  const content = (
    <>
      <TransactionTokensDisplay executionInput={executionInput} isOnramp={isOnramp} rampDirection={rampType} />
      {isAlfredpayToken(executionInput.fiatToken) && !isOnramp && <FiatAccountSelector />}

      {!rampRegistrationError && signingBoxVisible && (
        <div className="mx-auto mt-6 max-w-[320px]">
          <SigningBoxContent progress={progress} />
        </div>
      )}

      {rampRegistrationErrorMessage && (
        <AlertBanner
          className="mt-4 mb-4"
          icon={<ExclamationCircleIcon className="w-5 text-warning" />}
          title={rampRegistrationErrorMessage}
        />
      )}
    </>
  );

  return (
    <div className="relative flex grow-1 flex-col">
      <MenuButtons />
      <div className="mb-24">
        <h1 className="mt-4 mb-4 text-center font-bold text-primary text-widget-title">{headerText}</h1>
        <div className="pb-footer-offset">{content}</div>
      </div>
      <StepFooter>{actions}</StepFooter>
    </div>
  );
};
