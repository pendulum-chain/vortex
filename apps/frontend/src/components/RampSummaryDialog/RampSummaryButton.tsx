import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import {
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  TokenType
} from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useRampActor } from "../../contexts/rampState";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useFiatToken, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useRampActions, useRampExecutionInput, useRampState, useSigningRejected } from "../../stores/rampStore";
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
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));
  // get kyc child states
  useSelector(rampActor, parentState => {
    console.log("Parent state:", parentState);
  });
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
  }, [submitButtonDisabled, isQuoteExpired, rampDirection, rampState, t, isSubmitted, toToken]);
};

export const RampSummaryButton = () => {
  const rampActor = useRampActor();

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
    //anchorUrl: state.context.
  }));

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

    const isSubmitted = false;
    return isSubmitted;
  }, [executionInput, isQuoteExpired, isOfframp, isOnramp, rampState?.ramp?.depositQrCode, anchorUrl, fiatToken]);

  const buttonContent = useButtonContent({
    isSubmitted: false,
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    rampActor.send({ type: "SummaryConfirm" });
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
