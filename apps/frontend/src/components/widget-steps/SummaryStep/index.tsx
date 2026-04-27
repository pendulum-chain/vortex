import { ExclamationCircleIcon, UserIcon } from "@heroicons/react/24/solid";
import { FiatToken, isAlfredpayToken, MoneriumErrors, RampDirection } from "@vortexfi/shared";
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

  const { visible, executionInput, rampDirection, rampState, signingPhase, rampRegistrationError } = useSelector(
    rampActor,
    state => ({
      executionInput: state.context.executionInput,
      rampDirection: state.context.rampDirection,
      rampRegistrationError: state.context.initializeFailedMessage,
      rampState: state.context.rampState,
      signingPhase: state.context.rampSigningPhase,
      visible:
        state.matches("KycComplete") ||
        state.matches("RegisterRamp") ||
        state.matches("UpdateRamp") ||
        state.matches("StartRamp")
    })
  );
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
    if (visible && isOnramp && executionInput?.fiatToken === FiatToken.BRL && rampState?.ramp?.depositQrCode) {
      scrollToBottom();
    }
  }, [visible, isOnramp, executionInput?.fiatToken, rampState?.ramp?.depositQrCode, scrollToBottom]);

  useEffect(() => {
    if (
      visible &&
      isOnramp &&
      executionInput?.fiatToken === FiatToken.EURC &&
      rampState?.ramp?.ibanPaymentData &&
      signingPhase === "finished"
    ) {
      scrollToBottom();
    }
  }, [visible, isOnramp, executionInput?.fiatToken, rampState?.ramp?.ibanPaymentData, signingPhase, scrollToBottom]);

  const getRampRegistrationErrorMessage = useGetRampRegistrationErrorMessage();

  if (!visible) return null;
  if (!executionInput) return null;

  const isUserMintAddressNotFound =
    rampRegistrationError && rampRegistrationError === MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND;

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

      {isUserMintAddressNotFound && (
        <AlertBanner
          className="mt-4 mb-4"
          icon={<UserIcon className="w-5 text-warning" />}
          title={rampRegistrationErrorMessage ?? ""}
        >
          <progress className="progress progress-warning mt-4 w-56" />
        </AlertBanner>
      )}

      {!isUserMintAddressNotFound && rampRegistrationErrorMessage && (
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
