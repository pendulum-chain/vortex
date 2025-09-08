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
import { useMoneriumKycActor, useRampActor, useStellarKycSelector } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { useFiatToken, useOnChainToken, useQuoteFormStore } from "../../stores/quote/useQuoteFormStore";
import { useRampDirectionStore } from "../../stores/rampDirectionStore";
import { Spinner } from "../Spinner";

interface UseButtonContentProps {
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

const useButtonContent = ({ toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const stellarData = useStellarKycSelector();
  const rampDirection = useRampDirectionStore(state => state.activeDirection);

  const { rampState, rampPaymentConfirmed, machineState } = useSelector(rampActor, state => ({
    machineState: state.value,
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampState: state.context.rampState
  }));

  return useMemo(() => {
    const isOnramp = rampDirection === RampDirection.BUY;
    const isOfframp = rampDirection === RampDirection.SELL;
    const isDepositQrCodeReady = Boolean(rampState?.ramp?.depositQrCode);

    // BRL offramp has no redirect, it is the only with type moonbeam
    const isAnchorWithoutRedirect = toToken.type === "moonbeam";
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

    if (submitButtonDisabled) {
      return {
        icon: <Spinner />,
        text: t("components.swapSubmitButton.processing")
      };
    }

    if (isOfframp && isAnchorWithoutRedirect) {
      return {
        icon: null,
        text: t("components.RampSummaryCard.confirm")
      };
    }

    if (isOfframp && rampState !== undefined) {
      return {
        icon: <Spinner />,
        text: t("components.RampSummaryCard.processing")
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
        text: t("components.RampSummaryCard.confirm")
      };
    }

    return {
      icon: <Spinner />,
      text: t("components.swapSubmitButton.processing")
    };
  }, [submitButtonDisabled, rampDirection, rampState, machineState, t, toToken, stellarData, rampPaymentConfirmed]);
};

export const RampSubmitButton = ({ className }: { className?: string }) => {
  const rampActor = useRampActor();
  const stellarData = useStellarKycSelector();
  const { address } = useVortexAccount();
  const { lastConstraintDirection: rampDirection } = useQuoteFormStore();

  const moneriumKycActor = useMoneriumKycActor();

  const { rampState, executionInput, isQuoteExpired, machineState } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput,
    isQuoteExpired: state.context.isQuoteExpired,
    machineState: state.value,
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
    if (isOfframp) {
      if (!executionInput?.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    if (machineState === "RegisterRamp" || moneriumKycActor) {
      return true;
    }

    if (machineState === "UpdateRamp") {
      const isDepositQrCodeReady = Boolean(isOnramp && rampState?.ramp?.depositQrCode);
      if (isOnramp && !isDepositQrCodeReady) return true;
    }

    // The button is enabled because we let the user click the button to get back
    if (isQuoteExpired) {
      return true;
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
    machineState,
    address,
    moneriumKycActor
  ]);

  const buttonContent = useButtonContent({
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    rampActor.send({ type: "SummaryConfirm" });

    // For BRL offramps, set canRegisterRamp to true
    if (isOfframp && fiatToken === FiatToken.BRL && executionInput?.quote.rampType === RampDirection.SELL) {
      //setCanRegisterRamp(true);
    }

    if (isOnramp) {
      if (machineState === "UpdateRamp") {
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
    <button
      className={cn("btn-vortex-primary btn w-full rounded-xl", className)}
      disabled={submitButtonDisabled}
      onClick={onSubmit}
    >
      {buttonContent.icon}
      {buttonContent.icon && " "}
      {buttonContent.text}
    </button>
  );
};
