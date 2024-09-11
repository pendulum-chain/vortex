import { FC } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import Big from 'big.js';
import { roundDownToSignificantDecimals } from '../../helpers/parseNumbers';
import { OutputTokenDetails } from '../../constants/tokenConfig';
import { useEventsContext } from '../../contexts/events';

export function calculateTotalReceive(toAmount: string, outputToken: OutputTokenDetails): string {
  const feeBasisPoints = outputToken.offrampFeesBasisPoints;
  const fees = Big(toAmount).mul(feeBasisPoints).div(10000).round(2, 1);
  const totalReceive = Big(toAmount).minus(fees).toFixed(2, 0);
  return totalReceive;
}

interface CollapseProps {
  fromAmount?: string;
  toAmount?: string;
  toToken: OutputTokenDetails;
  exchangeRate?: JSX.Element;
}

export const FeeCollapse: FC<CollapseProps> = ({ fromAmount, toAmount, toToken, exchangeRate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { trackEvent } = useEventsContext();
  const toTokenSymbol = toToken.fiat.symbol;

  const toggleIsOpen = () => {
    trackEvent({ event: 'click_details' });
    setIsOpen((state) => !state);
  };

  const chevron = isOpen ? (
    <ChevronUpIcon className="w-8 text-blue-700" />
  ) : (
    <ChevronDownIcon className="w-8 text-blue-700" />
  );

  const toAmountFixed = roundDownToSignificantDecimals(new Big(toAmount || 0), 2).toString();
  const totalReceive = calculateTotalReceive(toAmount || '0', toToken);
  const feesCost = roundDownToSignificantDecimals(Big(toAmountFixed || 0).sub(totalReceive), 2).toString();

  return (
    <details className="transition border border-blue-700 collapse" onClick={toggleIsOpen}>
      <summary className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>Details</p>
          <div className="flex items-center ml-5 select-none">{chevron}</div>
        </div>
      </summary>
      <div className="collapse-content">
        <div className="flex justify-between">
          <p>Your quote ({exchangeRate})</p>
          <div className="flex">
            <span>
              {toAmountFixed} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <p>Offramp fees</p>
          <div className="flex">
            <span>
              - {feesCost} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <strong className="font-bold">Final Amount</strong>
          <div className="flex">
            <span>
              {totalReceive} {toTokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </details>
  );
};
