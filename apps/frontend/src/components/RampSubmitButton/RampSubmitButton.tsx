import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { useParams, useRouter } from "@tanstack/react-router";
import {
  FiatToken,
  FiatTokenDetails,
  getAddressForFormat,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isAlfredpayToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFiatAccountSelector } from "../../contexts/FiatAccountMachineContext";
import { useNetwork } from "../../contexts/network";
import { useMoneriumKycActor, useMykoboKycActor, useRampActor } from "../../contexts/rampState";
import { trimAddress } from "../../helpers/addressFormatter";
import { cn } from "../../helpers/cn";
import { useAlfredpayFiatAccounts } from "../../hooks/alfredpay/useFiatAccounts";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { navigateToCleanOrigin } from "../../lib/navigation";
import { useFiatToken, useOnChainToken } from "../../stores/quote/useQuoteFormStore";
import { Spinner } from "../Spinner";

interface UseButtonContentProps {
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

type ButtonContent = { icon: React.ReactNode; text: string };
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const quoteReadyLabel = (
  t: TFn,
  {
    isOnramp,
    isAnchorWithoutRedirect,
    inputCurrency
  }: { isOnramp: boolean; isAnchorWithoutRedirect: boolean; inputCurrency?: FiatToken }
): ButtonContent => {
  if (isOnramp && isAnchorWithoutRedirect) return { icon: null, text: t("components.SummaryPage.confirm") };
  if (isOnramp && inputCurrency === FiatToken.BRL) return { icon: null, text: t("components.SummaryPage.continue") };
  return { icon: null, text: t("components.SummaryPage.verifyWallet") };
};

interface ActiveRampInputs {
  isOnramp: boolean;
  isOfframp: boolean;
  isAnchorWithoutRedirect: boolean;
  isAnchorWithRedirect: boolean;
  hasPaymentInstructions: boolean;
  rampPaymentConfirmed: boolean;
  rampStateDefined: boolean;
}

const activeRampLabel = (t: TFn, p: ActiveRampInputs): ButtonContent => {
  if (p.isOfframp && p.isAnchorWithoutRedirect) return { icon: null, text: t("components.SummaryPage.confirm") };
  if (p.isOfframp && p.rampStateDefined) return { icon: <Spinner />, text: t("components.SummaryPage.processing") };
  if (p.isOnramp && p.hasPaymentInstructions && !p.rampPaymentConfirmed) {
    return { icon: null, text: t("components.swapSubmitButton.confirmPayment") };
  }
  if (p.isOnramp && !p.hasPaymentInstructions) return { icon: null, text: t("components.SummaryPage.confirm") };
  if (p.isOfframp && p.isAnchorWithRedirect) {
    return { icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />, text: t("components.SummaryPage.continueWithPartner") };
  }
  return { icon: <Spinner />, text: t("components.swapSubmitButton.processing") };
};

const isLockedToDesignatedWallet = (
  walletLocked: string | undefined,
  accountAddress: string | undefined,
  isOfframp: boolean,
  quoteFrom: string | undefined
): boolean => {
  if (!walletLocked || !accountAddress) return false;
  if (!isOfframp && quoteFrom !== "sepa") return false;
  return getAddressForFormat(accountAddress, 0) !== getAddressForFormat(walletLocked, 0);
};

const useButtonContent = ({ toToken, submitButtonDisabled }: UseButtonContentProps): ButtonContent => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { address: accountAddress } = useVortexAccount();

  const { isQuoteExpired, rampState, rampPaymentConfirmed, machineState, walletLocked, quote } = useSelector(
    rampActor,
    state => ({
      isQuoteExpired: state.context.isQuoteExpired,
      machineState: state.value,
      quote: state.context.quote,
      rampPaymentConfirmed: state.context.rampPaymentConfirmed,
      rampState: state.context.rampState,
      walletLocked: state.context.walletLocked
    })
  );

  return useMemo(() => {
    const isOnramp = quote?.rampType === RampDirection.BUY;
    const isOfframp = quote?.rampType === RampDirection.SELL;
    const hasPaymentInstructions =
      Boolean(rampState?.ramp?.depositQrCode) ||
      Boolean(rampState?.ramp?.achPaymentData) ||
      Boolean(rampState?.ramp?.ibanPaymentData);
    const hasAchPaymentData = Boolean(rampState?.ramp?.achPaymentData);

    // BRL (Avenia/moonbeam) and Mykobo EURC (Base) offramps complete inline. Monerium EURC (other chains)
    // still uses the redirect/auth flow. For EURC onramp (BUY), `quote.from` is "sepa" so
    // `isMykoboEurc` is false here and the button falls through to the standard onramp/KYC labels;
    // Mykobo's inline payment instructions are surfaced separately via EUROnrampDetails.
    const isMykoboEurc =
      quote?.outputCurrency === FiatToken.EURC && (quote?.from === Networks.Base || quote?.from === Networks.BaseSepolia);
    const isAnchorWithoutRedirect = toToken.type === "moonbeam" || isMykoboEurc;
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

    if (isLockedToDesignatedWallet(walletLocked, accountAddress, isOfframp, quote?.from)) {
      return {
        icon: null,
        text: t("components.RampSubmitButton.connectDesignatedWallet", { address: trimAddress(walletLocked!) })
      };
    }
    if (machineState === "QuoteReady") {
      return quoteReadyLabel(t, {
        inputCurrency: quote?.inputCurrency as FiatToken | undefined,
        isAnchorWithoutRedirect,
        isOnramp
      });
    }
    if (isQuoteExpired && !hasAchPaymentData) return { icon: null, text: t("components.SummaryPage.quoteExpired") };
    if (machineState === "KycComplete") return { icon: null, text: t("components.SummaryPage.confirm") };
    if (submitButtonDisabled) return { icon: <Spinner />, text: t("components.swapSubmitButton.processing") };

    return activeRampLabel(t, {
      hasPaymentInstructions,
      isAnchorWithoutRedirect,
      isAnchorWithRedirect,
      isOfframp,
      isOnramp,
      rampPaymentConfirmed,
      rampStateDefined: rampState !== undefined
    });
  }, [
    submitButtonDisabled,
    isQuoteExpired,
    rampState,
    machineState,
    t,
    toToken,
    rampPaymentConfirmed,
    quote,
    accountAddress,
    walletLocked
  ]);
};

export const RampSubmitButton = ({ className, hasValidationErrors }: { className?: string; hasValidationErrors?: boolean }) => {
  const rampActor = useRampActor();
  const { onRampConfirm } = useRampSubmission();
  const router = useRouter();
  const params = useParams({ strict: false });

  const moneriumKycActor = useMoneriumKycActor();
  const mykoboKycActor = useMykoboKycActor();
  const { address: accountAddress } = useVortexAccount();

  const { rampState, quote, executionInput, isQuoteExpired, machineState, walletLocked } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput,
    isQuoteExpired: state.context.isQuoteExpired,
    machineState: state.value,
    quote: state.context.quote,
    rampState: state.context.rampState,
    walletLocked: state.context.walletLocked
  }));

  const isOnramp = quote?.rampType === RampDirection.BUY;
  const isOfframp = quote?.rampType === RampDirection.SELL;
  const fiatToken = useFiatToken();
  const selectedFiatAccountId = useFiatAccountSelector(s => s.context.selectedFiatAccountId);
  const { data: fiatAccounts = [] } = useAlfredpayFiatAccounts();
  const effectiveSelectedFiatAccountId = selectedFiatAccountId ?? fiatAccounts[0]?.fiatAccountId ?? null;
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (hasValidationErrors) {
      return true;
    }

    if (
      walletLocked &&
      (isOfframp || quote?.from === "sepa") &&
      accountAddress &&
      getAddressForFormat(accountAddress, 0) !== getAddressForFormat(walletLocked, 0)
    ) {
      return true;
    }
    if (machineState === "QuoteReady") {
      return false;
    }

    if (machineState === "KycComplete") {
      if (isAlfredpayToken(fiatToken) && !effectiveSelectedFiatAccountId && isOfframp) return true;
      return false;
    }

    if (machineState === "RegisterRamp" || moneriumKycActor || mykoboKycActor) {
      return true;
    }

    // The button is enabled because we let the user click the button to get back
    if (isQuoteExpired) return false;

    if (!executionInput) return true;

    if (isOfframp) {
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    if (machineState === "UpdateRamp") {
      const hasPaymentInstructions =
        Boolean(isOnramp && rampState?.ramp?.depositQrCode) ||
        Boolean(rampState?.ramp?.achPaymentData) ||
        Boolean(isOnramp && rampState?.ramp?.ibanPaymentData);
      if (isOnramp && !hasPaymentInstructions) return true;
    }

    return false;
  }, [
    hasValidationErrors,
    executionInput,
    isQuoteExpired,
    isOfframp,
    isOnramp,
    rampState?.ramp?.depositQrCode,
    rampState?.ramp?.achPaymentData,
    rampState?.ramp?.ibanPaymentData,
    fiatToken,
    effectiveSelectedFiatAccountId,
    machineState,
    moneriumKycActor,
    mykoboKycActor,
    walletLocked,
    accountAddress,
    quote?.from
  ]);

  const buttonContent = useButtonContent({
    submitButtonDisabled,
    toToken: toToken as FiatTokenDetails
  });

  const onSubmit = () => {
    const hasAchPaymentData = Boolean(rampState?.ramp?.achPaymentData);

    if (isQuoteExpired && !hasAchPaymentData) {
      rampActor.send({ type: "RESET_RAMP" });
      navigateToCleanOrigin(router, params);
      return;
    }

    if (machineState === "QuoteReady") {
      onRampConfirm();
      return;
    }

    if (machineState === "KycComplete") {
      rampActor.send({ selectedFiatAccountId: effectiveSelectedFiatAccountId ?? undefined, type: "PROCEED_TO_REGISTRATION" });
      return;
    }

    rampActor.send({ type: "SummaryConfirm" });

    if (isOnramp) {
      if (machineState === "UpdateRamp") {
        rampActor.send({ type: "PAYMENT_CONFIRMED" });
      }
    }
  };

  return (
    <button className={cn("btn-vortex-primary btn w-full", className)} disabled={submitButtonDisabled} onClick={onSubmit}>
      {buttonContent.icon}
      {buttonContent.icon && " "}
      {buttonContent.text}
    </button>
  );
};
