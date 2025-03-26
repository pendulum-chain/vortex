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
import { Networks } from '../../helpers/networks';

import { ExchangeRate } from '../ExchangeRate';
import { NetworkIcon } from '../NetworkIcon';
import { Dialog } from '../Dialog';
import { Spinner } from '../Spinner';
import { useRampActions, useRampState } from '../../stores/offrampStore';
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

interface OfframpSummaryDialogProps {
  anchorUrl?: string;
  executionInput?: RampExecutionInput;
  visible: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export const OfframpSummaryDialog: FC<OfframpSummaryDialogProps> = ({
  anchorUrl,
  executionInput,
  visible,
  onClose,
  onSubmit,
}) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { selectedNetwork } = useNetwork();
  const { setRampExecutionInput, setRampInitiating, setRampStarted } = useRampActions();
  const offrampState = useRampState();

  // We use some defaults here to avoid issues with conditional calls to react hooks. This is safe because the
  // component will not render if the executionInput is undefined.
  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput?.onChainToken || EvmToken.USDC);
  const fromIcon = useGetAssetIcon(fromToken.networkAssetIcon);
  const toToken = getAnyFiatTokenDetails(executionInput?.fiatToken || FiatToken.EURC);
  const toIcon = useGetAssetIcon(toToken.fiat.assetIcon);

  const toAmount = Big(executionInput?.outputAmountUnits.afterFees || 0);
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
        amount={executionInput.inputAmountUnits}
        iconSrc={fromIcon}
      />
      <ArrowDownIcon className="w-4 h-4 my-2" />
      <AssetDisplay
        amount={executionInput.outputAmountUnits.afterFees}
        symbol={toToken.fiat.symbol}
        iconSrc={toIcon}
        iconAlt={toToken.fiat.symbol}
      />
      <FeeDetails
        fiatSymbol={toToken.fiat.symbol}
        fromToken={fromToken}
        toToken={toToken}
        partnerUrl={isStellarOutputTokenDetails(toToken) ? toToken.anchorHomepageUrl : toToken.partnerUrl}
        exchangeRate={executionInput.effectiveExchangeRate}
        network={selectedNetwork}
        feesCost={feesCost}
      />
    </div>
  );
  const actions = (
    <button
      disabled={isSubmitted}
      className="btn-vortex-primary btn rounded-xl"
      style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
      onClick={() => {
        setIsSubmitted(true);
        onSubmit();
        toToken.type !== 'moonbeam' ? open(anchorUrl, '_blank') : null;
      }}
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
      onClose={() => {
        setIsSubmitted(false);
        setRampExecutionInput(undefined);
        setRampStarted(false);
        setRampInitiating(false);
        onClose();
      }}
    />
  );
};
