import { isNetworkEVM, RampDirection } from "@packages/shared";
import { useAppKitAccount } from "@reown/appkit/react";
import Big from "big.js";
import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { usePolkadotWalletState } from "../../contexts/polkadotWallet";
import { useRampValidation } from "../../hooks/ramp/useRampValidation";
import { useMaintenanceAwareButton } from "../../hooks/useMaintenanceAware";
import { useInputAmount } from "../../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { ConnectWalletButton } from "../buttons/ConnectWalletButton";
import { Spinner } from "../Spinner";

interface WalletConnectedSubmitButtonProps extends QuoteSubmitButtonProps {
  needsWalletConnection?: boolean;
}

// TODO to be depricated. Use QuoteSubmitButton instead and handle connection on the widgets.
export const WalletConnectedSubmitButton: FC<WalletConnectedSubmitButtonProps> = ({
  className,
  disabled,
  pending,
  needsWalletConnection = false
}) => {
  const { walletAccount } = usePolkadotWalletState();
  const { isConnected } = useAppKitAccount();
  const { selectedNetwork } = useNetwork();

  if (needsWalletConnection) {
    if (!isNetworkEVM(selectedNetwork) && !walletAccount) {
      return (
        <div className={className} style={{ flex: "1 1 calc(50% - 0.75rem/2)" }}>
          <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon />
        </div>
      );
    }

    if (isNetworkEVM(selectedNetwork) && !isConnected) {
      return (
        <div className={className} style={{ flex: "1 1 calc(50% - 0.75rem/2)" }}>
          <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon />
        </div>
      );
    }
  }

  return <QuoteSubmitButton className={className} disabled={disabled} pending={pending} />;
};

interface QuoteSubmitButtonProps {
  className?: string;
  disabled?: boolean;
  pending?: boolean;
}

export const QuoteSubmitButton: FC<QuoteSubmitButtonProps> = ({ className, disabled, pending }) => {
  const { t } = useTranslation();
  const { getCurrentErrorMessage } = useRampValidation();
  const rampDirection = useRampDirection(); // XSTATE: maybe move into state.

  const currentErrorMessage = getCurrentErrorMessage();

  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();
  const quoteInputAmount = quote?.inputAmount;

  const isQuoteOutdated =
    (!!quoteInputAmount && !!inputAmount && !Big(quoteInputAmount).eq(Big(inputAmount))) || quote?.rampType !== rampDirection;
  const isSubmitButtonDisabled = disabled || Boolean(currentErrorMessage) || !quote || isQuoteOutdated;

  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton(isSubmitButtonDisabled || pending);

  const buttonText = useMemo((): string => {
    if (rampDirection === RampDirection.BUY) {
      return t("components.quoteSubmitButton.buy");
    } else {
      return t("components.quoteSubmitButton.sell");
    }
  }, [rampDirection, t]);

  const onClick = () => {
    // Pass the quote ID to the widget page
    const quoteId = quote?.id;
    if (quoteId) {
      window.location.href = `/widget?quoteId=${quoteId}`;
    }
  };

  return (
    <div className={className}>
      <button className="btn-vortex-primary btn w-full" disabled={isSubmitButtonDisabled} onClick={onClick}>
        {(isQuoteOutdated || pending) && <Spinner />}
        {isMaintenanceDisabled ? buttonProps.title : buttonText}
      </button>
    </div>
  );
};
