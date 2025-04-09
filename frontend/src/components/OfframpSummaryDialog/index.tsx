import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC } from 'react';
import Big from 'big.js';

import {
  getOnChainTokenDetailsOrDefault,
  OnChainTokenDetails,
  BaseFiatTokenDetails,
  isStellarOutputTokenDetails,
  getAnyFiatTokenDetails,
  TokenType,
  FiatTokenDetails,
} from 'shared';
import { useGetAssetIcon } from '../../hooks/useGetAssetIcon';
import { useOfframpFees } from '../../hooks/useOfframpFees';
import { useNetwork } from '../../contexts/network';
import { Networks } from 'shared';

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
  const isOfframp = direction === RampDirection.OFFRAMP;
  const feeLabel = isOfframp ? 'Offramp fee' : 'Onramp fee';

  const feeDisplayText = isOfframp
    ? `${feeLabel} (${(toToken as BaseFiatTokenDetails).offrampFeesBasisPoints / 100}%${
        (toToken as BaseFiatTokenDetails).offrampFeesFixedComponent
          ? ` + ${(toToken as BaseFiatTokenDetails).offrampFeesFixedComponent} ${fiatSymbol}`
          : ''
      })`
    : `${feeLabel}`;

  return (
    <section className="mt-6">
      <div className="flex justify-between mb-2">
        <p>{feeDisplayText}</p>
        <p className="flex items-center gap-2">
          <NetworkIcon network={network} className="w-4 h-4" />
          <strong>
            {feesCost} {isOfframp ? fiatSymbol : (toToken as OnChainTokenDetails).assetSymbol}
          </strong>
        </p>
      </div>
      <div className="flex justify-between mb-2">
        <p>Quote</p>
        <p>
          <ExchangeRate
            inputToken={isOfframp ? toToken : fromToken}
            outputToken={isOfframp ? fromToken : toToken}
            exchangeRate={Number(exchangeRate)}
          />
        </p>
      </div>
      <div className="flex justify-between">
        <p>Partner</p>
        <a href={partnerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};

interface TransactionTokensDisplayProps {
  executionInput: RampExecutionInput;
  isOnramp: boolean;
  selectedNetwork: Networks;
  feesCost: string;
  rampDirection: RampDirection;
}

const TransactionTokensDisplay: FC<TransactionTokensDisplayProps> = ({
  executionInput,
  isOnramp,
  selectedNetwork,
  feesCost,
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
    if (isOnramp) {
      return 'https://vortex.finance';
    }
    const fiatToken = toToken as FiatTokenDetails;
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
        exchangeRate={Big(executionInput.quote.outputAmount)
          .minus(executionInput.quote.fee)
          .div(executionInput.quote.inputAmount)
          .toFixed(4)}
        network={selectedNetwork}
        feesCost={feesCost}
        direction={rampDirection}
      />
    </div>
  );
};

export const OfframpSummaryDialog: FC = () => {
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

  const { feesCost } = useOfframpFees({
    toAmount: Big(executionInput?.quote.outputAmount || 0),
    toToken: isOnramp
      ? getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput!.onChainToken)
      : getAnyFiatTokenDetails(executionInput!.fiatToken),
  });

  if (!visible) return null;
  if (!executionInput) return null;

  if (!isOnramp) {
    if (!anchorUrl && getAnyFiatTokenDetails(executionInput.fiatToken).type === TokenType.Stellar) return null;
    if (!executionInput.brlaEvmAddress && getAnyFiatTokenDetails(executionInput.fiatToken).type === 'moonbeam')
      return null;
  }

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken)
    : getAnyFiatTokenDetails(executionInput.fiatToken);

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

  const headerText = isOnramp ? "You're buying" : "You're selling";

  const actions = (
    <button
      disabled={isSubmitted}
      className="btn-vortex-primary btn rounded-xl"
      style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
      onClick={onSubmit}
    >
      {offrampState !== undefined ? (
        <>
          <Spinner /> Processing
        </>
      ) : isSubmitted ? (
        <>
          <Spinner /> Continue on Partner&apos;s page
        </>
      ) : !isOnramp && (toToken as FiatTokenDetails).type !== 'moonbeam' ? (
        <>
          Continue with Partner <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      ) : (
        <>Continue</>
      )}
    </button>
  );

  const content = (
    <TransactionTokensDisplay
      executionInput={executionInput}
      isOnramp={isOnramp}
      selectedNetwork={selectedNetwork}
      feesCost={feesCost}
      rampDirection={rampDirection}
    />
  );

  return <Dialog content={content} visible={true} actions={actions} headerText={headerText} onClose={onClose} />;
};
