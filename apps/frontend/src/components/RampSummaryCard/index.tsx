import { ExclamationCircleIcon, UserIcon } from "@heroicons/react/24/solid";
import { FiatToken, RampDirection } from "@packages/shared";
import { MoneriumErrors } from "@packages/shared/src/endpoints/monerium";
import { useSelector } from "@xstate/react";
import Big from "big.js";
import { FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useRampActor } from "../../contexts/rampState";
import { useGetRampRegistrationErrorMessage } from "../../hooks/offramp/useRampService/useRegisterRamp/helpers";
import { useSigningBoxState } from "../../hooks/useSigningBoxState";
import { usePartnerId } from "../../stores/partnerStore";
import { useFiatToken, useOnChainToken } from "../../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../../stores/quote/useQuoteStore";
import { useRampSummaryActions } from "../../stores/rampSummary";
import { Dialog } from "../Dialog";
import { RampSubmitButton } from "../RampSubmitButton/RampSubmitButton";
import { SigningBoxButton, SigningBoxContent } from "../SigningBox/SigningBoxContent";
import { TransactionTokensDisplay } from "./TransactionTokensDisplay";

export const RampSummaryCard: FC = () => {
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

  const headerText = isOnramp
    ? t("components.RampSummaryCard.headerText.buy")
    : t("components.RampSummaryCard.headerText.sell");

  const actions = signingBoxVisible ? (
    <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
  ) : (
    <RampSubmitButton />
  );

  const content = (
    <>
      <TransactionTokensDisplay executionInput={executionInput} isOnramp={isOnramp} rampDirection={rampType} />

      {!rampRegistrationError && signingBoxVisible && (
        <div className="mx-auto mt-6 max-w-[320px]">
          <SigningBoxContent progress={progress} />
        </div>
      )}

      {isUserMintAddressNotFound && (
        <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-yellow-50 p-4">
          <div className="flex items-center">
            <UserIcon className="w-5 text-yellow-800" />
            <p className="ml-3 font-medium text-sm text-yellow-800">{rampRegistrationErrorMessage}</p>
          </div>
          <progress className="progress progress-warning mt-4 w-56" />
        </div>
      )}

      {!isUserMintAddressNotFound && rampRegistrationErrorMessage && (
        <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-yellow-50 p-4">
          <div className="flex items-center">
            <ExclamationCircleIcon className="w-5 text-yellow-800" />
            <p className="ml-3 font-medium text-sm text-yellow-800">{rampRegistrationErrorMessage}</p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex grow-1 flex-col justify-center">
      <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{headerText}</h1>
      {content}
      <div className="my-4 mt-auto flex">{actions}</div>
    </div>
  );
};
