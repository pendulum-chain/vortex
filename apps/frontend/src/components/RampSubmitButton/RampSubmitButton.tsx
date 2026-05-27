import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { useParams, useRouter } from "@tanstack/react-router";
import {
  FiatToken,
  FiatTokenDetails,
  getAddressForFormat,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isAlfredpayToken,
  isMoonbeamTokenDetails,
  RampDirection
} from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFiatAccountSelector } from "../../contexts/FiatAccountMachineContext";
import { useNetwork } from "../../contexts/network";
import { useRampActor } from "../../contexts/rampState";
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

interface LockedWalletArgs {
  walletLocked: string | undefined;
  accountAddress: string | undefined;
  isOfframp: boolean;
  quoteFrom: string | undefined;
}

function isLockedToAnotherWallet({ walletLocked, accountAddress, isOfframp, quoteFrom }: LockedWalletArgs): boolean {
  if (!walletLocked || !accountAddress) return false;
  if (!isOfframp && quoteFrom !== "sepa") return false;
  return getAddressForFormat(accountAddress, 0) !== getAddressForFormat(walletLocked, 0);
}

function getQuoteReadyContent(args: {
  isOnramp: boolean;
  isAnchorWithoutRedirect: boolean;
  inputCurrency: string | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { isOnramp, isAnchorWithoutRedirect, inputCurrency, t } = args;
  if (isOnramp && isAnchorWithoutRedirect) {
    return { icon: null, text: t("components.SummaryPage.confirm") };
  }
  if (isOnramp && inputCurrency === FiatToken.BRL) {
    return { icon: null, text: t("components.SummaryPage.continue") };
  }
  return { icon: null, text: t("components.SummaryPage.verifyWallet") };
}

const useButtonContent = ({ toToken, submitButtonDisabled }: UseButtonContentProps) => {
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
    const isDepositQrCodeReady =
      Boolean(rampState?.ramp?.depositQrCode) ||
      Boolean(rampState?.ramp?.achPaymentData) ||
      Boolean(rampState?.ramp?.ibanPaymentData);
    const hasAchPaymentData = Boolean(rampState?.ramp?.achPaymentData);

    if (isLockedToAnotherWallet({ accountAddress, isOfframp, quoteFrom: quote?.from, walletLocked })) {
      return {
        icon: null,
        text: t("components.RampSubmitButton.connectDesignatedWallet", { address: trimAddress(walletLocked as string) })
      };
    }

    // BRL offramp has no redirect, it is the only with type moonbeam
    const isAnchorWithoutRedirect = toToken.type === "moonbeam";
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

    if (machineState === "QuoteReady") {
      return getQuoteReadyContent({ inputCurrency: quote?.inputCurrency, isAnchorWithoutRedirect, isOnramp, t });
    }

    if (isQuoteExpired && !hasAchPaymentData) {
      return { icon: null, text: t("components.SummaryPage.quoteExpired") };
    }

    if (machineState === "KycComplete") {
      return { icon: null, text: t("components.SummaryPage.confirm") };
    }

    if (submitButtonDisabled) {
      return { icon: <Spinner />, text: t("components.swapSubmitButton.processing") };
    }

    if (isOfframp && isAnchorWithoutRedirect) {
      return { icon: null, text: t("components.SummaryPage.confirm") };
    }

    if (isOfframp && rampState !== undefined) {
      return { icon: <Spinner />, text: t("components.SummaryPage.processing") };
    }

    if (isOnramp && isDepositQrCodeReady && !rampPaymentConfirmed) {
      return { icon: null, text: t("components.swapSubmitButton.confirmPayment") };
    }

    if (isOnramp && !isDepositQrCodeReady) {
      return { icon: null, text: t("components.SummaryPage.confirm") };
    }

    if (isOfframp && isAnchorWithRedirect) {
      return {
        icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />,
        text: t("components.SummaryPage.continueWithPartner")
      };
    }
    return { icon: <Spinner />, text: t("components.swapSubmitButton.processing") };
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

    if (isLockedToAnotherWallet({ accountAddress, isOfframp, quoteFrom: quote?.from, walletLocked })) {
      return true;
    }
    if (machineState === "QuoteReady") {
      return false;
    }

    if (machineState === "KycComplete") {
      if (isAlfredpayToken(fiatToken) && !effectiveSelectedFiatAccountId && isOfframp) return true;
      return false;
    }

    if (machineState === "RegisterRamp") {
      return true;
    }

    // The button is enabled because we let the user click the button to get back
    if (isQuoteExpired) return false;

    if (!executionInput) return true;

    if (isOfframp) {
      if (!isMoonbeamTokenDetails(getAnyFiatTokenDetails(fiatToken))) return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === "moonbeam") return true;
    }

    if (machineState === "UpdateRamp") {
      const isDepositQrCodeReady =
        Boolean(isOnramp && rampState?.ramp?.depositQrCode) ||
        Boolean(rampState?.ramp?.achPaymentData) ||
        Boolean(isOnramp && rampState?.ramp?.ibanPaymentData);
      if (isOnramp && !isDepositQrCodeReady) return true;
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

    if (isOnramp && machineState === "UpdateRamp") {
      rampActor.send({ type: "PAYMENT_CONFIRMED" });
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
