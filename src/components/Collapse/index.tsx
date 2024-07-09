import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import { FC } from 'preact/compat';

interface CollapseProps {
  amount?: string;
  currency?: string;
}

const FEES_RATE = 0.005;

export const Collapse: FC<CollapseProps> = ({ amount, currency }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleIsOpen = () => setIsOpen((state) => !state);

  const chevron = isOpen ? (
    <ChevronUpIcon className="w-8 text-blue-700" />
  ) : (
    <ChevronDownIcon className="w-8 text-blue-700" />
  );

  const feesCost = FEES_RATE * Number(amount);
  const feesCostTrimmed = feesCost.toFixed(3);

  const totalReceive = Number(amount) - feesCost;
  const totalReceiveTrimmed = totalReceive.toFixed(3);

  return (
    <details className="collapse border border-blue-700 transition" onClick={toggleIsOpen}>
      <summary className="collapse-title py-2 px-4 min-h-0">
        <div className="flex justify-between items-center">
          <p>
            <strong className="font-bold">
              {isNaN(totalReceive) ? '0.00' : totalReceiveTrimmed} {currency}
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
              {isNaN(feesCost) ? '0.00' : feesCostTrimmed} {currency}
            </span>
          </div>
        </div>
      </div>
    </details>
  );
};
