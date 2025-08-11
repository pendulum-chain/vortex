import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import {
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  TokenType
} from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useRampActor, useStellarKycSelector } from "../../contexts/rampState";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useFiatToken, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { RampDirection } from "../RampToggle";
import { Spinner } from "../Spinner";

interface UseButtonContentProps {
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

export const useButtonContent = ({ toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const stellarData = useStellarKycSelector();

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));

  const rampDirection = rampState?.ramp?.type === "on" ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
  const isQuoteExpired = useIsQuoteExpired();

  return useMemo(() => {
    const isOnramp = rampDirection === RampDirection.ONRAMP;
    const isOfframp = rampDirection === RampDirection.OFFRAMP;
    const isDepositQrCodeReady = Boolean(rampState?.ramp?.depositQrCode);

    // BRL offramp has no redirect, it is the only with type moonbeam
    const isAnchorWithoutRedirect = toToken.type === "moonbeam";
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

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

    if (isOnramp && isDepositQrCodeReady) {
      return {
        icon: null,
        text: t("components.swapSubmitButton.confirmPayment")
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
  }, [submitButtonDisabled, isQuoteExpired, rampDirection, rampState, t, toToken, stellarData]);
};

export const RampSummaryButton = () => {
  const rampActor = useRampActor();
  const { onRampConfirm } = useRampSubmission();
  const stellarData = useStellarKycSelector();

  const { rampState, executionInput, isQuoteExpired } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput,
    isQuoteExpired: state.context.isQuoteExpired,
    rampState: state.context.rampState
  }));

  const stellarContext = stellarData?.context;
  const anchorUrl = stellarContext?.redirectUrl;

  const rampDirection = rampState?.ramp?.type === "on" ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;
    if (isQuoteExpired) return true;

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (stellarData?.stateValue === "Sep24Second") return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    const isDepositQrCodeReady = Boolean(isOnramp && rampState?.ramp?.depositQrCode);
    if (isOnramp && !isDepositQrCodeReady) return true;

    return false;
  }, [
    executionInput,
    isQuoteExpired,
    isOfframp,
    isOnramp,
    rampState?.ramp?.depositQrCode,
    anchorUrl,
    fiatToken,
    stellarContext
  ]);

  const buttonContent = useButtonContent({
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    rampActor.send({ type: "SummaryConfirm" });
    console.log("SummaryConfirm event sent");
    // For BRL offramps, set canRegisterRamp to true
    if (isOfframp && fiatToken === FiatToken.BRL && executionInput?.quote.rampType === "off") {
      //setCanRegisterRamp(true);
    }

    if (executionInput?.quote.rampType === "on") {
      //setRampPaymentConfirmed(true);
    } else {
      onRampConfirm();
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
    <button
      className="btn-vortex-primary btn rounded-xl"
      disabled={submitButtonDisabled}
      onClick={onSubmit}
      style={{ flex: "1 1 calc(50% - 0.75rem/2)" }}
    >
      {buttonContent.icon}
      {buttonContent.icon && " "}
      {buttonContent.text}
    </button>
  );
};
