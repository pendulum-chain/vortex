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
import { SigningBoxButton, SigningBoxContent } from "../SigningBox/SigningBoxContent";
import { RampSummaryButton } from "./RampSummaryButton";
import { TransactionTokensDisplay } from "./TransactionTokensDisplay";

export const RampSummaryDialog: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { selectedNetwork } = useNetwork();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const {
    quote,
    actions: { fetchQuote }
  } = useQuoteStore();
  const partnerId = usePartnerId();
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
      visible: state.context.rampSummaryVisible // TODO replace with proper error
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

  const onClose = () => {
    rampActor.send({ type: "CANCEL_RAMP" });
    fetchQuote({
      fiatToken,
      inputAmount: Big(quote?.inputAmount || "0"),
      onChainToken,
      partnerId: partnerId === null ? undefined : partnerId,
      rampType,
      selectedNetwork
    });
  };

  const isUserMintAddressNotFound =
    rampRegistrationError && rampRegistrationError === MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND;

  const rampRegistrationErrorMessage = getRampRegistrationErrorMessage(rampRegistrationError);

  const headerText = isOnramp
    ? t("components.dialogs.RampSummaryDialog.headerText.buy")
    : t("components.dialogs.RampSummaryDialog.headerText.sell");

  const actions = rampRegistrationErrorMessage ? (
    <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onClose}>
      {t("components.dialogs.RampSummaryDialog.tryAgain")}
    </button>
  ) : signingBoxVisible ? (
    <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
  ) : (
    <RampSummaryButton />
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
    <div className="flex flex-col justify-center">
      <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{headerText}</h1>
      {content}
      <div className="flex grow-1 my-4">{actions}</div>
    </div>
  );
};
