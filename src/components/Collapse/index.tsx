import { useState } from 'preact/hooks';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';

export const Collapse = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleIsOpen = () => setIsOpen((state) => !state);

  const chevron = isOpen ? (
    <ChevronUpIcon className="w-8 text-blue-700" />
  ) : (
    <ChevronDownIcon className="w-8 text-blue-700" />
  );

  return (
    <details className="collapse border border-blue-700 transition" onClick={toggleIsOpen}>
      <summary className="collapse-title py-2 px-4 min-h-0">
        <div className="flex justify-between items-center">
          <p>
            <span className="font-bold">1746.24 BRL</span> is what you will receive, after fees
          </p>
          <div className="flex items-center">
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
            <p>$0.5</p>
          </div>
        </div>
      </div>
    </details>
  );
};
