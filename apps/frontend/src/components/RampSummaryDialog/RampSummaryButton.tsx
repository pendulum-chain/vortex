import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import {
  FiatToken,
  FiatTokenDetails,
  TokenType,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
} from '@packages/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../../contexts/network';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import {
  useCanRegisterRamp,
  useRampActions,
  useRampExecutionInput,
  useRampState,
  useSigningRejected,
} from '../../stores/rampStore';
import { useIsQuoteExpired, useRampSummaryStore } from '../../stores/rampSummary';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { RampDirection } from '../RampToggle';
import { Spinner } from '../Spinner';

interface UseButtonContentProps {
  isSubmitted: boolean;
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
}

export const useButtonContent = ({ isSubmitted, toToken, submitButtonDisabled }: UseButtonContentProps) => {
  const rampState = useRampState();
  const { t } = useTranslation();
  const rampDirection = rampState?.ramp?.type === 'on' ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
  const isQuoteExpired = useIsQuoteExpired();
  const canRegisterRamp = useCanRegisterRamp();
  const signingRejected = useSigningRejected();

  return useMemo(() => {
    const isOnramp = rampDirection === RampDirection.ONRAMP;
    const isOfframp = rampDirection === RampDirection.OFFRAMP;
    const isBRCodeReady = Boolean(true);

    // BRL offramp has no redirect, it is the only with type moonbeam
    const isAnchorWithoutRedirect = toToken.type === 'moonbeam';
    const isAnchorWithRedirect = !isAnchorWithoutRedirect;

    if ((isOnramp && isBRCodeReady && isQuoteExpired) || (isOfframp && isQuoteExpired)) {
      return {
        text: t('components.dialogs.RampSummaryDialog.quoteExpired'),
        icon: null,
      };
    }

    // Add check for signing rejection
    if (signingRejected) {
      return {
        text: t('components.dialogs.RampSummaryDialog.tryAgain'),
        icon: null,
      };
    }

    if (submitButtonDisabled) {
      console.log('here 6');
      return {
        text: t('components.swapSubmitButton.processing'),
        icon: <Spinner />,
      };
    }

    if (isOfframp && isAnchorWithoutRedirect && !canRegisterRamp) {
      console.log('here 5');
      return {
        text: t('components.dialogs.RampSummaryDialog.confirm'),
        icon: null,
      };
    }

    if (isOfframp && rampState !== undefined) {
      console.log('here 4');
      return {
        text: t('components.dialogs.RampSummaryDialog.processing'),
        icon: <Spinner />,
      };
    }

    if (isOnramp && isBRCodeReady) {
      console.log('here 3');
      return {
        text: t('components.swapSubmitButton.confirmPayment'),
        icon: null,
      };
    }

    if (isOfframp && isAnchorWithRedirect) {
      if (isSubmitted) {
        console.log('here 2');
        return {
          text: t('components.dialogs.RampSummaryDialog.continueOnPartnersPage'),
          icon: <Spinner />,
        };
      } else {
        console.log('here 1');
        return {
          text: t('components.dialogs.RampSummaryDialog.continueWithPartner'),
          icon: <ArrowTopRightOnSquareIcon className="w-4 h-4" />,
        };
      }
    }
    console.log('here');
    return {
      text: t('components.swapSubmitButton.processing'),
      icon: <Spinner />,
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
    signingRejected,
  ]);
};

export const RampSummaryButton = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { setRampPaymentConfirmed, setCanRegisterRamp, setSigningRejected } = useRampActions();
  const rampState = useRampState();
  const signingRejected = useSigningRejected();
  const { onRampConfirm } = useRampSubmission();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const rampDirection = rampState?.ramp?.type === 'on' ? RampDirection.ONRAMP : RampDirection.OFFRAMP;
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

    if (signingRejected) {
      return false;
    }

    return isSubmitted;
  }, [
    executionInput,
    isQuoteExpired,
    isOfframp,
    isOnramp,
    rampState?.ramp?.brCode,
    isSubmitted,
    anchorUrl,
    fiatToken,
    signingRejected,
  ]);

  const buttonContent = useButtonContent({
    isSubmitted,
    toToken: toToken as FiatTokenDetails,
    submitButtonDisabled,
  });

  const onSubmit = () => {
    setIsSubmitted(true);

    // For BRL offramps, set canRegisterRamp to true
    if (isOfframp && fiatToken === FiatToken.BRL && executionInput?.quote.rampType === 'off') {
      setCanRegisterRamp(true);
    }

    if (executionInput?.quote.rampType === 'on') {
      setRampPaymentConfirmed(true);
    } else {
      onRampConfirm();
    }

    if (!isOnramp && (toToken as FiatTokenDetails).type !== 'moonbeam' && anchorUrl) {
      // If signing was rejected, we do not open the anchor URL again
      if (!signingRejected) {
        window.open(anchorUrl, '_blank');
      }
    }

    if (signingRejected) {
      setSigningRejected(false);
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
