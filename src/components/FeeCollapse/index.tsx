import { FC } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import Big from 'big.js';
import { roundDownToSignificantDecimals } from '../../helpers/parseNumbers';
import { OutputTokenDetails } from '../../constants/tokenConfig';
import { useEventsContext } from '../../contexts/events';

const FEES_RATE = 0.05; // 0.5% fee rate

function calculateTotalReceive(toAmount: string, outputToken: OutputTokenDetails): string {
  const feeBasisPoints = outputToken.offrampFeesBasisPoints;
  const fees = Big(toAmount).mul(feeBasisPoints).div(10000).round(2, 1);
  const totalReceive = Big(toAmount).minus(fees).toFixed(2, 0);
  return totalReceive;
}

function calculateFeesUSD(fromAmount: string): string {
  const totalReceiveUSD = Number(fromAmount) * (1 - FEES_RATE);
  const feesCost = Number(fromAmount) - Number(totalReceiveUSD);
  return roundDownToSignificantDecimals(new Big(feesCost || 0), 2).toString();
}

interface CollapseProps {
  fromAmount?: string;
  toAmount?: string;
  toToken: OutputTokenDetails;
}

export const FeeCollapse: FC<CollapseProps> = ({ fromAmount, toAmount, toToken }) => {
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

  const totalReceive = calculateTotalReceive(toAmount || '0', toToken);
  const feesCost = calculateFeesUSD(fromAmount || '0');

  return (
    <details className="transition border border-blue-700 collapse" onClick={toggleIsOpen}>
      <summary className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>
            <strong className="font-bold">
              {totalReceive} {toTokenSymbol}
            </strong>
            &nbsp;is what you will receive, after fees
          </p>
          <div className="flex items-center ml-5 select-none">
            <p>Show fees</p>
            {chevron}
          </div>
        </div>
      </summary>
      <div className="collapse-content">
        <div className="flex justify-between">
          <p>Total fees</p>
          <div className="flex">
            <LocalGasStationIcon className="w-8 text-blue-700" />
            <span>${feesCost}</span>
          </div>
        </div>
      </div>
    </details>
  );
};
