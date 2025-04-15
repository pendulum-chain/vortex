import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC, useMemo, useEffect } from 'react';
import Big from 'big.js';

import {
  getOnChainTokenDetailsOrDefault,
  OnChainTokenDetails,
  BaseFiatTokenDetails,
  isStellarOutputTokenDetails,
  getAnyFiatTokenDetails,
  TokenType,
  FiatTokenDetails,
  isFiatTokenDetails,
  Networks,
} from 'shared';
import { useGetAssetIcon } from '../../hooks/useGetAssetIcon';
import { useNetwork } from '../../contexts/network';

import { ExchangeRate } from '../ExchangeRate';
import { NetworkIcon } from '../NetworkIcon';
import { Dialog } from '../Dialog';
import { Spinner } from '../Spinner';
import { useRampActions, useRampState, useRampExecutionInput, useRampSummaryVisible } from '../../stores/offrampStore';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../../components/RampToggle';
import { RampExecutionInput } from '../../types/phases';
import { useTranslation } from 'react-i18next';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { QRCodeSVG } from 'qrcode.react';
import { CopyButton } from '../CopyButton';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';

// Define onramp expiry time in minutes. This is not arbitrary, but based on the assumptions imposed by the backend.
const ONRAMP_EXPIRY_MINUTES = 5;

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  iconAlt: string;
}

const AssetDisplay = ({ amount, symbol, iconSrc, iconAlt }: AssetDisplayProps) => (
  <div className="flex items-center justify-between w-full">
    <span className="text-lg font-bold">
      {amount} {symbol}
    </span>
    <img src={iconSrc} alt={iconAlt} className="w-8 h-8" />
  </div>
);

interface FeeDetailsProps {
  network: Networks;
  feesCost: string;
  fiatSymbol: string;
  exchangeRate: string;
  fromToken: OnChainTokenDetails | FiatTokenDetails;
  toToken: OnChainTokenDetails | FiatTokenDetails;
  partnerUrl: string;
  direction: RampDirection;
}

const FeeDetails = ({
  network,
  feesCost,
  fiatSymbol,
  fromToken,
  toToken,
  exchangeRate,
  partnerUrl,
  direction,
}: FeeDetailsProps) => {
  const { t } = useTranslation();

  const isOfframp = direction === RampDirection.OFFRAMP;

  const fiatToken = (isOfframp ? toToken : fromToken) as FiatTokenDetails;
  if (!isFiatTokenDetails(fiatToken)) {
    throw new Error('Invalid fiat token details');
  }

  return (
    <section className="mt-6">
      <div className="flex justify-between mb-2">
        <p>
          {isOfframp
            ? t('components.dialogs.OfframpSummaryDialog.offrampFee')
            : t('components.dialogs.OfframpSummaryDialog.onrampFee')}{' '}
          ({`${fiatToken.offrampFeesBasisPoints / 100}%`}
          {fiatToken.offrampFeesFixedComponent ? ` + ${fiatToken.offrampFeesFixedComponent} ${fiatSymbol}` : ''})
        </p>
        <p className="flex items-center gap-2">
          <NetworkIcon network={network} className="w-4 h-4" />
          <strong>
            {feesCost} {(toToken as OnChainTokenDetails).assetSymbol}
          </strong>
        </p>
      </div>
      <div className="flex justify-between mb-2">
        <p>{t('components.dialogs.OfframpSummaryDialog.quote')}</p>
        <p>
          <ExchangeRate
            inputToken={isOfframp ? fromToken : toToken}
            outputToken={isOfframp ? toToken : fromToken}
            exchangeRate={Number(exchangeRate)}
          />
        </p>
      </div>
      <div className="flex justify-between">
        <p>{t('components.dialogs.OfframpSummaryDialog.partner')}</p>
        <a href={partnerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};

const BRLOnrampDetails = () => {
  const rampDirection = useRampDirection();
  const { t } = useTranslation();
  const rampState = useRampState();

  if (rampDirection !== RampDirection.ONRAMP) return null;
  if (!rampState?.ramp?.brCode) return null;

  return (
    <section>
      <hr className="my-5" />
      <h1 className="font-bold text-lg">{t('components.dialogs.OfframpSummaryDialog.BRLOnrampDetails.title')}</h1>
      <h2 className="font-bold text-center text-lg">
        {t('components.dialogs.OfframpSummaryDialog.BRLOnrampDetails.description')}
      </h2>
      <p className="pt-2 text-center">{t('components.dialogs.OfframpSummaryDialog.BRLOnrampDetails.qrCode')}</p>
      <div className="flex justify-center my-6">
        <div className="border-1 border-gray-300 rounded-lg p-4">
          <QRCodeSVG value={rampState.ramp?.brCode} />
        </div>
      </div>
      <p className="text-center">{t('components.dialogs.OfframpSummaryDialog.BRLOnrampDetails.copyCode')}</p>
      <CopyButton text={rampState.ramp?.brCode} className="w-full mt-4 py-10" />
    </section>
  );
};

interface TransactionTokensDisplayProps {
  executionInput: RampExecutionInput;
  isOnramp: boolean;
  selectedNetwork: Networks;
  rampDirection: RampDirection;
  onExpiryChange: (isExpired: boolean) => void;
}

const TransactionTokensDisplay: FC<TransactionTokensDisplayProps> = ({
  executionInput,
  isOnramp,
  selectedNetwork,
  rampDirection,
  onExpiryChange,
}) => {
  const { t } = useTranslation();
  const rampState = useRampState(); // Use rampState hook
  const [timeLeft, setTimeLeft] = useState({ minutes: 0, seconds: 0 }); // Initialize differently
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    let targetTimestamp: number | null = null;

    if (isOnramp) {
      // Onramp: Use ramp creation time + expiry duration
      const createdAt = rampState?.ramp?.createdAt;
      if (createdAt) {
        targetTimestamp = new Date(createdAt).getTime() + ONRAMP_EXPIRY_MINUTES * 60 * 1000;
      }
    } else {
      // Offramp: Use quote expiry time directly
      const expiresAt = executionInput.quote.expiresAt;
      targetTimestamp = new Date(expiresAt).getTime();
    }

    if (targetTimestamp === null) {
      // If no valid timestamp, mark as expired immediately
      setTimeLeft({ minutes: 0, seconds: 0 });
      setIsExpired(true);
      onExpiryChange(true);
      return;
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      const diff = targetTimestamp - now;

      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0 });
        setIsExpired(true);
        onExpiryChange(true); // Notify parent component
        clearInterval(intervalId);
        return;
      }

      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ minutes, seconds });
      setIsExpired(false);
      onExpiryChange(false);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [
    isOnramp,
    rampState?.ramp?.createdAt,
    rampState?.quote.expiresAt,
    onExpiryChange,
    executionInput.quote.expiresAt,
  ]);

  const formattedTime = `${timeLeft.minutes}:${timeLeft.seconds < 10 ? '0' : ''}${timeLeft.seconds}`;

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(executionInput.fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken);

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken)
    : getAnyFiatTokenDetails(executionInput.fiatToken);

  const fromIcon = useGetAssetIcon(
    isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.assetIcon : (fromToken as OnChainTokenDetails).networkAssetIcon,
  );
  const toIcon = useGetAssetIcon(
    isOnramp ? (toToken as OnChainTokenDetails).networkAssetIcon : (toToken as BaseFiatTokenDetails).fiat.assetIcon,
  );

  const getPartnerUrl = (): string => {
    const fiatToken = (isOnramp ? fromToken : toToken) as FiatTokenDetails;
    return isStellarOutputTokenDetails(fiatToken) ? fiatToken.anchorHomepageUrl : fiatToken.partnerUrl;
  };

  const fiatSymbol = isOnramp
    ? (fromToken as BaseFiatTokenDetails).fiat.symbol
    : (toToken as BaseFiatTokenDetails).fiat.symbol;

  return (
    <div className="flex flex-col justify-center">
      <AssetDisplay
        iconAlt={
          isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.symbol : (fromToken as OnChainTokenDetails).assetSymbol
        }
        symbol={
          isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.symbol : (fromToken as OnChainTokenDetails).assetSymbol
        }
        amount={executionInput.quote.inputAmount}
        iconSrc={fromIcon}
      />
      <ArrowDownIcon className="w-4 h-4 my-2" />
      <AssetDisplay
        amount={executionInput.quote.outputAmount}
        symbol={isOnramp ? (toToken as OnChainTokenDetails).assetSymbol : (toToken as BaseFiatTokenDetails).fiat.symbol}
        iconSrc={toIcon}
        iconAlt={
          isOnramp ? (toToken as OnChainTokenDetails).assetSymbol : (toToken as BaseFiatTokenDetails).fiat.symbol
        }
      />
      <FeeDetails
        fiatSymbol={fiatSymbol}
        fromToken={fromToken}
        toToken={toToken}
        partnerUrl={getPartnerUrl()}
        exchangeRate={Big(executionInput.quote.outputAmount).div(executionInput.quote.inputAmount).toFixed(4)}
        network={selectedNetwork}
        feesCost={executionInput.quote.fee}
        direction={rampDirection}
      />
      <BRLOnrampDetails />
      <div className="text-center text-gray-600 font-semibold my-4">Quote expires in: {formattedTime}</div>
    </div>
  );
};

const useButtonContent = ({
  isSubmitted,
  toToken,
  submitButtonDisabled,
  isQuoteExpired,
}: {
  isSubmitted: boolean;
  toToken: FiatTokenDetails;
  submitButtonDisabled: boolean;
  isQuoteExpired: boolean;
}) => {
  const rampState = useRampState();
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const isBRCodeReady = Boolean(rampState?.ramp?.brCode);

  // BRL offramp has no redirect, it is the only with type moonbeam
  const isAnchorWithoutRedirect = toToken.type === 'moonbeam';
  const isAnchorWithRedirect = !isAnchorWithoutRedirect;

  return useMemo(() => {
    if (submitButtonDisabled) {
      return {
        text: t('components.swapSubmitButton.processing'),
        icon: <Spinner />,
      };
    }

    if (isQuoteExpired) {
      return {
        text: t('components.swapSubmitButton.quoteExpired'),
        icon: null,
      };
    }

    if (isOfframp && rampState !== undefined) {
      return {
        text: t('components.dialogs.OfframpSummaryDialog.processing'),
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
          text: t('components.dialogs.OfframpSummaryDialog.continueOnPartnersPage'),
          icon: <Spinner />,
        };
      } else {
        return {
          text: t('components.dialogs.OfframpSummaryDialog.continueWithPartner'),
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

export const OfframpSummaryDialog: FC = () => {
  const { t } = useTranslation();

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isQuoteExpired, setIsQuoteExpired] = useState(false); // State for quote expiry

  const { selectedNetwork } = useNetwork();
  const { resetRampState, setRampPaymentConfirmed } = useRampActions();
  const rampState = useRampState();
  const executionInput = useRampExecutionInput();
  const visible = useRampSummaryVisible();
  const { onRampConfirm } = useRampSubmission();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const isOfframp = rampDirection === RampDirection.OFFRAMP;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();

  const { quote, fetchQuote } = useQuoteStore();

  // Handler for quote expiry changes
  const handleExpiryChange = (expired: boolean) => {
    setIsQuoteExpired(expired);
  };

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;
    if (isQuoteExpired) return true; // Disable if quote is expired

    if (isOfframp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === 'moonbeam') return true;
    }

    const isBRCodeReady = Boolean(isOnramp && rampState?.ramp?.brCode);
    if (!isBRCodeReady) return true;

    return isSubmitted;
  }, [executionInput, isQuoteExpired, isOfframp, isOnramp, rampState?.ramp?.brCode, isSubmitted, anchorUrl, fiatToken]);

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken)
    : getAnyFiatTokenDetails(fiatToken);

  const buttonContent = useButtonContent({
    isSubmitted,
    toToken,
    submitButtonDisabled,
    isQuoteExpired,
  });

  if (!visible) return null;
  if (!executionInput) return null;

  const onClose = () => {
    resetRampState();
    // Make sure a new quote is fetched immediately. The previous one was consumed when this dialog was opened
    fetchQuote({
      rampType: isOnramp ? 'on' : 'off',
      inputAmount: Big(quote?.inputAmount || '0'),
      onChainToken,
      fiatToken,
      selectedNetwork,
    });
  };

  const onSubmit = () => {
    setIsSubmitted(true);

    if (executionInput.quote.rampType === 'on') {
      setRampPaymentConfirmed(true);
    } else {
      onRampConfirm();
    }

    if (!isOnramp && (toToken as FiatTokenDetails).type !== 'moonbeam' && anchorUrl) {
      window.open(anchorUrl, '_blank');
    }
  };

  const headerText = isOnramp
    ? t('components.dialogs.OfframpSummaryDialog.headerText.buy')
    : t('components.dialogs.OfframpSummaryDialog.headerText.sell');

  const actions = (
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

  const content = (
    <TransactionTokensDisplay
      executionInput={executionInput}
      isOnramp={isOnramp}
      selectedNetwork={selectedNetwork}
      rampDirection={rampDirection}
      onExpiryChange={handleExpiryChange} // Pass handler down
    />
  );

  return <Dialog content={content} visible={visible} actions={actions} headerText={headerText} onClose={onClose} />;
};
