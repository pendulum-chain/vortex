import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import {
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  RampDirection,
  TokenType
} from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useRampActor, useStellarKycSelector } from "../../contexts/rampState";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useFiatToken, useOnChainToken } from "../../stores/quote/useQuoteFormStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { Spinner } from "../Spinner";

interface UseButtonContentProps {
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

export const useButtonContent = ({ toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const stellarData = useStellarKycSelector();

  const { rampState, rampPaymentConfirmed, rampDirection, machineState } = useSelector(rampActor, state => ({
    machineState: state.value,
    rampDirection: state.context.rampDirection,
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampState: state.context.rampState
  }));

  const isQuoteExpired = useIsQuoteExpired();

  return useMemo(() => {
    const isOnramp = rampDirection === RampDirection.BUY;
    const isOfframp = rampDirection === RampDirection.SELL;
    const isDepositQrCodeReady = Boolean(rampState?.ramp?.depositQrCode);

    // BRL offramp has no redirect, it is the only with type moonbeam
    const isAnchorWithoutRedirect = toToken.type === "moonbeam";
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

    if (machineState === "QuoteReady") {
      return {
        icon: null,
        text: t("components.dialogs.RampSummaryDialog.next")
      };
    }

    if ((isOnramp && isDepositQrCodeReady && isQuoteExpired) || (isOfframp && isQuoteExpired)) {
      return {
        icon: null,
        text: t("components.dialogs.RampSummaryDialog.quoteExpired")
      };
    }

    // XSTATE migrate: we can display this on failure, generic failure.
    // Add check for signing rejection
    // if (signingRejected) {
    //   return {
    //     icon: null,
    //     text: t("components.dialogs.RampSummaryDialog.tryAgain")
    //   };
    // }

    if (submitButtonDisabled) {
      return {
        icon: <Spinner />,
        text: t("components.swapSubmitButton.processing")
      };
    }

    if (isOfframp && isAnchorWithoutRedirect) {
      return {
        icon: null,
        text: t("components.dialogs.RampSummaryDialog.confirm")
      };
    }

    if (isOfframp && rampState !== undefined) {
      return {
        icon: <Spinner />,
        text: t("components.dialogs.RampSummaryDialog.processing")
      };
    }

    if (isOnramp && isDepositQrCodeReady && !rampPaymentConfirmed) {
      return {
        icon: null,
        text: t("components.swapSubmitButton.confirmPayment")
      };
    }

    if (isOnramp && !isDepositQrCodeReady) {
      return {
        icon: null,
        text: t("components.dialogs.RampSummaryDialog.confirm")
      };
    }

    if (isOfframp && isAnchorWithRedirect) {
      if (stellarData?.stateValue === "Sep24Second") {
        return {
          icon: <Spinner />,
          text: t("components.dialogs.RampSummaryDialog.continueOnPartnersPage")
        };
      } else {
        return {
          icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />,
          text: t("components.dialogs.RampSummaryDialog.continueWithPartner")
        };
      }
    }
    return {
      icon: <Spinner />,
      text: t("components.swapSubmitButton.processing")
    };
  }, [
    submitButtonDisabled,
    isQuoteExpired,
    rampDirection,
    rampState,
    machineState,
    t,
    toToken,
    stellarData,
    rampPaymentConfirmed
  ]);
};

export const RampSummaryButton = () => {
  const rampActor = useRampActor();
  const { onRampConfirm } = useRampSubmission();
  const stellarData = useStellarKycSelector();

  const { rampState, rampDirection, executionInput, isQuoteExpired, machineState } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput,
    isQuoteExpired: state.context.isQuoteExpired,
    machineState: state.value,
    rampDirection: state.context.rampDirection,
    rampState: state.context.rampState
  }));

  const stellarContext = stellarData?.context;
  const anchorUrl = stellarContext?.redirectUrl;

  const isOfframp = rampDirection === RampDirection.SELL;
  const isOnramp = rampDirection === RampDirection.BUY;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;
    if (isQuoteExpired) return true;

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (stellarData?.stateValue !== "StartSep24") return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    if (machineState === "UpdateRamp") {
      const isDepositQrCodeReady = Boolean(isOnramp && rampState?.ramp?.depositQrCode);
      if (isOnramp && !isDepositQrCodeReady) return true;
    }

    return false;
  }, [
    executionInput,
    isQuoteExpired,
    isOfframp,
    isOnramp,
    rampState?.ramp?.depositQrCode,
    anchorUrl,
    fiatToken,
    stellarData,
    machineState
  ]);

  const buttonContent = useButtonContent({
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    if (machineState === "QuoteReady") {
      onRampConfirm();
      return;
    }

    rampActor.send({ type: "SummaryConfirm" });
    // For BRL offramps, set canRegisterRamp to true
    if (isOfframp && fiatToken === FiatToken.BRL && executionInput?.quote.rampType === RampDirection.SELL) {
      //setCanRegisterRamp(true);
    }

    if (isOnramp) {
      if (machineState === "KycComplete") {
        rampActor.send({ type: "PROCEED_TO_REGISTRATION" });
      } else if (machineState === "UpdateRamp") {
        rampActor.send({ type: "PAYMENT_CONFIRMED" });
      }
    }

    if (!isOnramp && (toToken as FiatTokenDetails).type !== "moonbeam" && anchorUrl) {
      // If signing was rejected, we do not open the anchor URL again
      // if (!signingRejected) {
      //   window.open(anchorUrl, "_blank");
      // }
    }

    // if (signingRejected) {
    //   setSigningRejected(false);
    // }
  };

  return (
    <button className="btn-vortex-primary btn w-full rounded-xl" disabled={submitButtonDisabled} onClick={onSubmit}>
      {buttonContent.icon}
      {buttonContent.icon && " "}
      {buttonContent.text}
    </button>
  );
};
