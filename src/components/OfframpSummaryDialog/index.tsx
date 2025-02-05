import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC } from 'react';
import Big from 'big.js';

import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  InputTokenDetails,
  OutputTokenDetails,
} from '../../constants/tokenConfig';
import { useGetAssetIcon } from '../../hooks/useGetAssetIcon';
import { useOfframpFees } from '../../hooks/useOfframpFees';
import { useNetwork } from '../../contexts/network';
import { Networks } from '../../helpers/networks';

import { ExchangeRate } from '../ExchangeRate';
import { NetworkIcon } from '../NetworkIcon';
import { Dialog } from '../Dialog';
import { Spinner } from '../Spinner';
import { OfframpExecutionInput } from '../../types/offramp';

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
  fromToken: InputTokenDetails;
  toToken: OutputTokenDetails;
}

const FeeDetails = ({ network, feesCost, fiatSymbol, fromToken, toToken, exchangeRate }: FeeDetailsProps) => (
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
          <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={fiatSymbol} />
        </strong>
      </p>
    </div>
    <div className="flex justify-between">
      <p>Partner</p>
      <a
        href={toToken.anchorHomepageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
      >
        {toToken.anchorHomepageUrl}
      </a>
    </div>
  </section>
);

interface OfframpSummaryDialogProps {
  anchorUrl?: string;
  executionInput?: OfframpExecutionInput;
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

  console.log('OfframpSummaryDialog', { anchorUrl, executionInput, visible, onClose, onSubmit });

  if (!visible) return null;
  if (!anchorUrl) return null;
  if (!executionInput) return null;

  const fromToken = getInputTokenDetailsOrDefault(selectedNetwork, executionInput.inputTokenType);
  const fromIcon = useGetAssetIcon(fromToken.networkAssetIcon);
  const toToken = getOutputTokenDetails(executionInput.outputTokenType);
  const toIcon = useGetAssetIcon(toToken.fiat.assetIcon);

  const toAmount = Big(executionInput.outputAmountUnits.afterFees);
  const { feesCost } = useOfframpFees(toAmount, toToken);

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
        window.open(anchorUrl, '_blank');
      }}
    >
      {isSubmitted ? (
        <>
          <Spinner /> Continue on Partner&apos;s page
        </>
      ) : (
        <>
          Continue with Partner <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      )}
    </button>
  );

  return <Dialog content={content} visible={visible} actions={actions} headerText="You're selling" onClose={onClose} />;
};
