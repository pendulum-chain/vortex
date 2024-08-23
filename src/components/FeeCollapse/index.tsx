import { FC } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import Big from 'big.js';
import { roundDownToSignificantDecimals } from '../../helpers/parseNumbers';
import { OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { useEventsContext } from '../../contexts/events';

const FEES_RATE = 0.05; // 0.5% fee rate

function calculateTotalReceive(toAmount: string): string {
  const totalReceive = Number(toAmount) * (1 - FEES_RATE);
  return roundDownToSignificantDecimals(new Big(totalReceive || 0), 2).toString();
}

function calculateFeesUSD(fromAmount: string): string {
  const totalReceiveUSD = Number(fromAmount) * (1 - FEES_RATE);
  const feesCost = Number(fromAmount) - Number(totalReceiveUSD);
  return roundDownToSignificantDecimals(new Big(feesCost || 0), 2).toString();
}

interface CollapseProps {
  fromAmount?: string;
  toAmount?: string;
  toTokenSymbol: string;
}

export const FeeCollapse: FC<CollapseProps> = ({ fromAmount, toAmount, toTokenSymbol }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { trackEvent } = useEventsContext();

  const toggleIsOpen = () => {
    trackEvent({ event: 'click_details' });
    setIsOpen((state) => !state);
  };

  const chevron = isOpen ? (
    <ChevronUpIcon className="w-8 text-blue-700" />
  ) : (
    <ChevronDownIcon className="w-8 text-blue-700" />
  );

  const totalReceive = calculateTotalReceive(toAmount || '0');
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
