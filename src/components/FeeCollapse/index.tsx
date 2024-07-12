import { FC } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import Big from 'big.js';

interface CollapseProps {
  amount?: string;
  currency?: string;
}

const FEES_RATE = 0.05;

function roundDownToSignificantDecimals(big: Big, decimals: number): Big {
  return big.prec(Math.max(0, big.e + 1) + decimals, 0);
}

export const FeeCollapse: FC<CollapseProps> = ({ amount, currency }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleIsOpen = () => setIsOpen((state) => !state);

  const chevron = isOpen ? (
    <ChevronUpIcon className="w-8 text-blue-700" />
  ) : (
    <ChevronDownIcon className="w-8 text-blue-700" />
  );

  const totalReceive = Number(amount) * (1 - FEES_RATE);
  const totalReceiveTrimmed = roundDownToSignificantDecimals(new Big(totalReceive || 0), 2);

  const feesCost = Number(amount) - Number(totalReceiveTrimmed);
  const feesCostTrimmed = roundDownToSignificantDecimals(new Big(feesCost || 0), 2);

  return (
    <details className="transition border border-blue-700 collapse" onClick={toggleIsOpen}>
      <summary className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>
            <strong className="font-bold">
              {isNaN(totalReceive) ? '0.00' : totalReceiveTrimmed.toString()}
              {currency}
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
            <span>
              {isNaN(feesCost) ? '0.00' : feesCostTrimmed.toString()}
              {currency}
            </span>
          </div>
        </div>
      </div>
    </details>
  );
};
