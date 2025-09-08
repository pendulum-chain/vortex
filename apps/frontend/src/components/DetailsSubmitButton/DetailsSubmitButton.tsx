import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
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
import { cn } from "../../helpers/cn";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
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
  const fiatToken = useFiatToken();
  const rampDirection = useRampDirectionStore(state => state.activeDirection);
  const stellarData = useStellarKycSelector();

  const { isQuoteExpired, machineState } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired,
    machineState: state.value
  }));

  return useMemo(() => {
    const isOnramp = rampDirection === RampDirection.BUY;
    const isOfframp = rampDirection === RampDirection.SELL;

    const isAnchorWithoutRedirect = toToken.type === "moonbeam";

    if (machineState === "QuoteReady") {
      if (fiatToken === FiatToken.BRL) {
        return {
          icon: null,
          text: t("components.RampSummaryCard.continue")
        };
      }
      if (fiatToken === FiatToken.EURC && rampDirection === RampDirection.SELL) {
        return {
          icon: null,
          text: t("components.RampSummaryCard.next")
        };
      }
      if (fiatToken === FiatToken.EURC && rampDirection === RampDirection.BUY) {
        return {
          icon: null,
          text: t("components.RampSummaryCard.verifyWallet")
        };
      }
      if (isOnramp && isAnchorWithoutRedirect) {
        return {
          icon: null,
          text: t("components.RampSummaryCard.confirm")
        };
      } else {
        return {
          icon: null,
          text: t("components.RampSummaryCard.signIn")
        };
      }
    }

    if (isQuoteExpired) {
      return {
        icon: null,
        text: t("components.RampSummaryCard.quoteExpired")
      };
    }

    if (isOfframp && !isAnchorWithoutRedirect) {
      if (stellarData?.stateValue === "Sep24Second") {
        return {
          icon: <Spinner />,
          text: t("components.RampSummaryCard.continueOnPartnersPage")
        };
      } else {
        return {
          icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />,
          text: t("components.RampSummaryCard.continueWithPartner")
        };
      }
    }

    if (submitButtonDisabled) {
      return {
        icon: <Spinner />,
        text: t("components.swapSubmitButton.processing")
      };
    }

    return {
      icon: <Spinner />,
      text: t("components.swapSubmitButton.processing")
    };
  }, [submitButtonDisabled, isQuoteExpired, rampDirection, machineState, t, toToken, fiatToken, stellarData]);
};

export const DetailsSubmitButton = ({ className }: { className?: string }) => {
  const rampActor = useRampActor();
  const stellarData = useStellarKycSelector();

  const { onRampConfirm } = useRampSubmission();
  const { address } = useVortexAccount();
  const { lastConstraintDirection: rampDirection } = useQuoteFormStore();

  const { isQuoteExpired, machineState } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired,
    machineState: state.value
  }));

  const isOfframp = rampDirection === RampDirection.SELL;
  const isOnramp = rampDirection === RampDirection.BUY;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();

  const stellarContext = stellarData?.context;
  const anchorUrl = stellarContext?.redirectUrl;

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (isOfframp) {
      if (!address) return true;
    }

    if (isQuoteExpired) {
      return false;
    }

    if (machineState === "QuoteReady") {
      return false;
    }

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
    }

    if (stellarData?.stateValue === "Sep24Second") return true;

    return false;
  }, [isQuoteExpired, isOfframp, machineState, address, stellarData, anchorUrl, fiatToken]);

  const buttonContent = useButtonContent({
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    if (isQuoteExpired) {
      // Reset the ramp state and go back to the home page
      rampActor.send({ type: "RESET_RAMP" });
      const cleanUrl = window.location.origin;
      window.history.replaceState({}, "", cleanUrl);
      return;
    }

    if (machineState === "QuoteReady") {
      onRampConfirm();
      return;
    }

    rampActor.send({ type: "SummaryConfirm" });
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
