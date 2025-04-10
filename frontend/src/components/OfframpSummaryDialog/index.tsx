import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC, useMemo } from 'react';
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
          {t('components.dialogs.OfframpSummaryDialog.offrampFee')} ({`${fiatToken.offrampFeesBasisPoints / 100}%`}
          {fiatToken.offrampFeesFixedComponent ? ` + ${fiatToken.offrampFeesFixedComponent} ${fiatSymbol}` : ''})
        </p>
        <p className="flex items-center gap-2">
          <NetworkIcon network={network} className="w-4 h-4" />
          <strong>
            {feesCost} {isOfframp ? fiatSymbol : (toToken as OnChainTokenDetails).assetSymbol}
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
      <p className="text-center">{t('components.dialogs.OfframpSummaryDialog.BRLOnrampDetails.pixCode')}:</p>
      <CopyButton text={rampState.ramp?.brCode} className="w-full mt-4 py-10" />
    </section>
  );
};

interface TransactionTokensDisplayProps {
  executionInput: RampExecutionInput;
  isOnramp: boolean;
  selectedNetwork: Networks;
  rampDirection: RampDirection;
}

const TransactionTokensDisplay: FC<TransactionTokensDisplayProps> = ({
  executionInput,
  isOnramp,
  selectedNetwork,
  rampDirection,
}) => {
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
    </div>
  );
};

export const OfframpSummaryDialog: FC = () => {
  const { t } = useTranslation();

  const [isSubmitted, setIsSubmitted] = useState(false);

  const { selectedNetwork } = useNetwork();
  const { setRampExecutionInput, setRampInitiating, setRampStarted, setRampSummaryVisible } = useRampActions();
  const offrampState = useRampState();
  const executionInput = useRampExecutionInput();
  const visible = useRampSummaryVisible();
  const { onRampConfirm } = useRampSubmission();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();

  const submitButtonDisabled = useMemo(() => {
    if (!executionInput) return true;

    if (!isOnramp) {
      if (!anchorUrl && getAnyFiatTokenDetails(fiatToken).type === TokenType.Stellar) return true;
      if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(fiatToken).type === 'moonbeam') return true;
    }

    return isSubmitted;
  }, [anchorUrl, executionInput, fiatToken, isOnramp, isSubmitted]);

  if (!visible) return null;
  if (!executionInput) return null;

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken)
    : getAnyFiatTokenDetails(fiatToken);

  const onClose = () => {
    setIsSubmitted(false);
    setRampExecutionInput(undefined);
    setRampStarted(false);
    setRampInitiating(false);
    setRampSummaryVisible(false);
  };

  const onSubmit = () => {
    setIsSubmitted(true);
    onRampConfirm();

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
      {offrampState !== undefined ? (
        <>
          <Spinner /> {t('components.dialogs.OfframpSummaryDialog.processing')}
        </>
      ) : isSubmitted ? (
        <>
          <Spinner /> {t('components.dialogs.OfframpSummaryDialog.continueOnPartnersPage')}
        </>
      ) : !isOnramp && (toToken as FiatTokenDetails).type !== 'moonbeam' ? (
        <>
          {t('components.dialogs.OfframpSummaryDialog.continueWithPartner')}{' '}
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      ) : (
        <>{t('components.dialogs.OfframpSummaryDialog.continue')}</>
      )}
    </button>
  );

  const content = (
    <TransactionTokensDisplay
      executionInput={executionInput}
      isOnramp={isOnramp}
      selectedNetwork={selectedNetwork}
      rampDirection={rampDirection}
    />
  );

  return <Dialog content={content} visible={visible} actions={actions} headerText={headerText} onClose={onClose} />;
};
