import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { FiatTokenDetails, getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault, TokenType } from 'shared';
import { useRampExecutionInput, useRampState } from '../../stores/offrampStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';
import { useRampSummaryStore } from '../../stores/rampSummary';
import { useRampActions } from '../../stores/offrampStore';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';

interface UseButtonContentProps {
  isSubmitted: boolean;
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

export const useButtonContent = ({ isSubmitted, toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const rampState = useRampState();
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const { isQuoteExpired } = useRampSummaryStore();

  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const isBRCodeReady = Boolean(rampState?.ramp?.brCode);

  // BRL offramp has no redirect, it is the only with type moonbeam
  const isAnchorWithoutRedirect = toToken.type === 'moonbeam';
  const isAnchorWithRedirect = !isAnchorWithoutRedirect;

  return useMemo(() => {
    if (isBRCodeReady && isQuoteExpired) {
      return {
        text: t('components.dialogs.RampSummaryDialog.quoteExpired'),
        icon: null,
      };
    }

    if (submitButtonDisabled) {
      return {
        text: t('components.swapSubmitButton.processing'),
        icon: <Spinner />,
      };
    }

    if (isOfframp && rampState !== undefined) {
      return {
        text: t('components.dialogs.RampSummaryDialog.processing'),
        icon: <Spinner />,
      };
    }

    if (isOnramp && isBRCodeReady) {
      return {
        text: t('components.swapSubmitButton.confirmPayment'),
        icon: null,
      };
    }

    if (isOfframp && isAnchorWithRedirect) {
      if (isSubmitted) {
        return {
          text: t('components.dialogs.RampSummaryDialog.continueOnPartnersPage'),
          icon: <Spinner />,
        };
      } else {
        return {
          text: t('components.dialogs.RampSummaryDialog.continueWithPartner'),
          icon: <ArrowTopRightOnSquareIcon className="w-4 h-4" />,
        };
      }
    }

    return {
      text: t('components.swapSubmitButton.processing'),
      icon: <Spinner />,
    };
  }, [
    submitButtonDisabled,
    isQuoteExpired,
    isOfframp,
    rampState,
    isOnramp,
    isBRCodeReady,
    isAnchorWithRedirect,
    t,
    isSubmitted,
  ]);
};

export const RampSummaryButton = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { setRampPaymentConfirmed } = useRampActions();
  const rampState = useRampState();
  const { onRampConfirm } = useRampSubmission();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const rampDirection = useRampDirection();
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const { isQuoteExpired } = useRampSummaryStore();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { selectedNetwork } = useNetwork();
  const executionInput = useRampExecutionInput();

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken)
    : getAnyFiatTokenDetails(fiatToken);

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;
    if (isQuoteExpired) return true;

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === 'moonbeam') return true;
    }

    const isBRCodeReady = Boolean(isOnramp && rampState?.ramp?.brCode);
    if (isOnramp && !isBRCodeReady) return true;

    return isSubmitted;
  }, [executionInput, isQuoteExpired, isOfframp, isOnramp, rampState?.ramp?.brCode, isSubmitted, anchorUrl, fiatToken]);

  const buttonContent = useButtonContent({
    isSubmitted,
    toToken: toToken as FiatTokenDetails,
    submitButtonDisabled,
  });

  const onSubmit = () => {
    setIsSubmitted(true);

    if (executionInput?.quote.rampType === 'on') {
      setRampPaymentConfirmed(true);
    } else {
      onRampConfirm();
    }

    if (!isOnramp && (toToken as FiatTokenDetails).type !== 'moonbeam' && anchorUrl) {
      window.open(anchorUrl, '_blank');
    }
  };

  return (
    <button
      disabled={submitButtonDisabled}
      className="btn-vortex-primary btn rounded-xl"
      style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
      onClick={onSubmit}
    >
      {buttonContent.icon}
      {buttonContent.icon && ' '}
      {buttonContent.text}
    </button>
  );
};
