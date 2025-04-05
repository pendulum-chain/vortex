import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC } from 'react';
import Big from 'big.js';

import {
  getOnChainTokenDetailsOrDefault,
  OnChainTokenDetails,
  BaseFiatTokenDetails,
  isStellarOutputTokenDetails,
  getAnyFiatTokenDetails,
  FiatToken,
  EvmToken,
  TokenType,
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
  fromToken: OnChainTokenDetails;
  toToken: BaseFiatTokenDetails;
  partnerUrl: string;
}

const FeeDetails = ({
  network,
  feesCost,
  fiatSymbol,
  fromToken,
  toToken,
  exchangeRate,
  partnerUrl,
}: FeeDetailsProps) => (
  <section className="mt-6">
    <div className="flex justify-between mb-2">
      <p>
        Offramp fee ({`${toToken.offrampFeesBasisPoints / 100}%`}
        {toToken.offrampFeesFixedComponent ? ` + ${toToken.offrampFeesFixedComponent} ${fiatSymbol}` : ''})
      </p>
      <p className="flex items-center gap-2">
        <NetworkIcon network={network} className="w-4 h-4" />
        <strong>
          {feesCost} {fiatSymbol}
        </strong>
      </p>
    </div>
    <div className="flex justify-between mb-2">
      <p>Quote</p>
      <p>
        <strong>
          <ExchangeRate exchangeRate={Number(exchangeRate)} fromToken={fromToken} toTokenSymbol={fiatSymbol} />
        </strong>
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

export const OfframpSummaryDialog: FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { selectedNetwork } = useNetwork();
  const { setRampExecutionInput, setRampInitiating, setRampStarted, setRampSummaryVisible } = useRampActions();
  const offrampState = useRampState();
  const executionInput = useRampExecutionInput();
  const visible = useRampSummaryVisible();
  const { handleOfframpSubmit } = useRampSubmission();

  const anchorUrl = executionInput?.anchorUrl;

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput?.onChainToken || EvmToken.USDC);
  const fromIcon = useGetAssetIcon(fromToken.networkAssetIcon);
  const toToken = getAnyFiatTokenDetails(executionInput?.fiatToken || FiatToken.EURC);
  const toIcon = useGetAssetIcon(toToken.fiat.assetIcon);

  const toAmount = executionInput ? Big(executionInput.quote.outputAmount || 0) : Big(0);
  const { feesCost } = useOfframpFees(toAmount, toToken);

  if (!visible) return null;
  if (!anchorUrl && toToken.type === TokenType.Stellar) return null;
  if (!executionInput?.brlaEvmAddress && toToken.type === 'moonbeam') return null;
  if (!executionInput) return null;

  const content = (
    <div className="flex flex-col justify-center">
      <AssetDisplay
        iconAlt={fromToken.networkAssetIcon}
        symbol={fromToken.assetSymbol}
        amount={executionInput.quote.inputAmount}
        iconSrc={fromIcon}
      />
      <ArrowDownIcon className="w-4 h-4 my-2" />
      <AssetDisplay
        amount={executionInput.quote.outputAmount}
        symbol={toToken.fiat.symbol}
        iconSrc={toIcon}
        iconAlt={toToken.fiat.symbol}
      />
      <FeeDetails
        fiatSymbol={toToken.fiat.symbol}
        fromToken={fromToken}
        toToken={toToken}
        partnerUrl={isStellarOutputTokenDetails(toToken) ? toToken.anchorHomepageUrl : toToken.partnerUrl}
        exchangeRate={Big(executionInput.quote.outputAmount).minus(executionInput.quote.fee).div(executionInput.quote.inputAmount).toFixed(2)}
        network={selectedNetwork}
        feesCost={feesCost}
      />
    </div>
  );

  const onClose = () => {
    setIsSubmitted(false);
    setRampExecutionInput(undefined);
    setRampStarted(false);
    setRampInitiating(false);
    setRampSummaryVisible(false);
  };

  const onSubmit = () => {
    setIsSubmitted(true);
    handleOfframpSubmit();
    toToken.type !== 'moonbeam' ? open(anchorUrl, '_blank') : null;
  };

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
      ) : toToken.type !== 'moonbeam' ? (
        <>
          Continue with Partner <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      ) : (
        <>Continue</>
      )}
    </button>
  );

  return (
    <Dialog
      content={content}
      visible={visible}
      actions={actions}
      headerText="You're selling"
      onClose={onClose}
    />
  );
};
