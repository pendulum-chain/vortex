import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import {
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  TokenType
} from "@packages/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useFiatToken, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import {
  useCanRegisterRamp,
  useRampActions,
  useRampExecutionInput,
  useRampState,
  useSigningRejected
} from "../../stores/rampStore";
import { useIsQuoteExpired, useRampSummaryStore } from "../../stores/rampSummary";
import { useSep24StoreCachedAnchorUrl } from "../../stores/sep24Store";
import { RampDirection } from "../RampToggle";
import { Spinner } from "../Spinner";

interface UseButtonContentProps {
  isSubmitted: boolean;
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

export const useButtonContent = ({ isSubmitted, toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const rampState = useRampState();
  const { t } = useTranslation();
  const rampDirection = rampState?.ramp?.type === "on" ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
  const isQuoteExpired = useIsQuoteExpired();
  const canRegisterRamp = useCanRegisterRamp();
  const signingRejected = useSigningRejected();

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

    // Add check for signing rejection
    if (signingRejected) {
      return {
        icon: null,
        text: t("components.dialogs.RampSummaryDialog.tryAgain")
      };
    }

    if (submitButtonDisabled) {
      return {
        icon: <Spinner />,
        text: t("components.swapSubmitButton.processing")
      };
    }

    if (isOfframp && isAnchorWithoutRedirect && !canRegisterRamp) {
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
      if (isSubmitted) {
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
    t,
    isSubmitted,
    canRegisterRamp,
    toToken,
    signingRejected
  ]);
};

export const RampSummaryButton = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { setRampPaymentConfirmed, setCanRegisterRamp, setSigningRejected } = useRampActions();
  const rampState = useRampState();
  const signingRejected = useSigningRejected();
  const { onRampConfirm } = useRampSubmission();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const rampDirection = rampState?.ramp?.type === "on" ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const { isQuoteExpired } = useRampSummaryStore();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();
  const executionInput = useRampExecutionInput();

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;
    if (isQuoteExpired) return true;

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    const isDepositQrCodeReady = Boolean(isOnramp && rampState?.ramp?.depositQrCode);
    if (isOnramp && !isDepositQrCodeReady) return true;

    if (signingRejected) {
      return false;
    }

    return isSubmitted;
  }, [
    executionInput,
    isQuoteExpired,
    isOfframp,
    isOnramp,
    rampState?.ramp?.depositQrCode,
    isSubmitted,
    anchorUrl,
    fiatToken,
    signingRejected
  ]);

  const buttonContent = useButtonContent({
    isSubmitted,
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    setIsSubmitted(true);

    // For BRL offramps, set canRegisterRamp to true
    if (isOfframp && fiatToken === FiatToken.BRL && executionInput?.quote.rampType === "off") {
      setCanRegisterRamp(true);
    }

    if (executionInput?.quote.rampType === "on") {
      setRampPaymentConfirmed(true);
    } else {
      onRampConfirm();
    }

    if (!isOnramp && (toToken as FiatTokenDetails).type !== "moonbeam" && anchorUrl) {
      // If signing was rejected, we do not open the anchor URL again
      if (!signingRejected) {
        window.open(anchorUrl, "_blank");
      }
    }

    if (signingRejected) {
      setSigningRejected(false);
    }
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
