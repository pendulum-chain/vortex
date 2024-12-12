import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { NetworkIcon } from '../NetworkIcon';
import { NetworkIconType } from '../../hooks/useGetNetworkIcon';
import { Networks, useNetwork } from '../../contexts/network';
import { useState, useRef, useEffect } from 'preact/hooks';

const NETWORK_DISPLAY_NAMES: Record<Networks, string> = {
  [Networks.AssetHub]: 'Polkadot AssetHub',
  [Networks.Polygon]: 'Polygon',
  [Networks.Ethereum]: 'Ethereum',
  [Networks.BSC]: 'BNB Smart Chain',
  [Networks.Arbitrum]: 'Arbitrum One',
  [Networks.Base]: 'Base',
  [Networks.Avalanche]: 'Avalanche',
};

function networkToDisplayName(network: Networks): string {
  return NETWORK_DISPLAY_NAMES[network] ?? network;
}

interface NetworkButtonProps {
  selectedNetwork: Networks;
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const NetworkButton = ({ selectedNetwork, isOpen, onClick, disabled }: NetworkButtonProps) => (
  <motion.button
    className={`flex items-center gap-2 px-4 py-2 rounded-full bg-base-100 ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    }`}
    onClick={onClick}
    whileHover={{ scale: disabled ? 1 : 1.02 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
    disabled={disabled}
  >
    <NetworkIcon chainId={selectedNetwork} className={`w-5 h-5 ${disabled ? 'opacity-50' : ''}`} />
    <span className={disabled ? 'opacity-50' : ''}>{networkToDisplayName(selectedNetwork)}</span>
    <motion.div
      animate={{ rotate: isOpen ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className={disabled ? 'opacity-50' : ''}
    >
      <ChevronDownIcon className="block w-4 h-4 ml-1" />
    </motion.div>
  </motion.button>
);

interface NetworkDropdownProps {
  isOpen: boolean;
  onNetworkSelect: (networkId: NetworkIconType) => void;
  disabled?: boolean;
}

const NetworkDropdown = ({ isOpen, onNetworkSelect, disabled }: NetworkDropdownProps) => (
  <AnimatePresence>
    {isOpen && !disabled && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute z-50 w-48 p-2 mt-2 shadow-lg bg-base-100 rounded-box whitespace-nowrap"
        layout
      >
        {Object.values(Networks).map((networkId) => (
          <button
            key={networkId}
            onClick={() => onNetworkSelect(networkId)}
            className="flex items-center w-full gap-2 p-2 rounded-lg hover:bg-base-200"
          >
            <NetworkIcon chainId={networkId} className="w-5 h-5" />
            <span>{networkToDisplayName(networkId)}</span>
          </button>
        ))}
      </motion.div>
    )}
  </AnimatePresence>
);

function useClickOutside(ref: React.RefObject<HTMLElement>, callback: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [callback, ref]);
}

export const NetworkSelector = ({ disabled }: { disabled?: boolean }) => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const handleNetworkSelect = (networkId: NetworkIconType) => {
    setSelectedNetwork(networkId);
    setIsOpen(false);
  };

  const wrapperProps = disabled
    ? {
        className: 'tooltip tooltip-primary tooltip-bottom before:whitespace-pre-wrap before:content-[attr(data-tip)]',
        'data-tip': 'The offramp is in progress. Cannot switch networks.',
      }
    : {};

  return (
    <div {...wrapperProps}>
      <div className={`relative mr-2 ${disabled ? 'pointer-events-none' : ''}`} ref={dropdownRef}>
        <NetworkButton
          selectedNetwork={selectedNetwork}
          isOpen={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        />
        <NetworkDropdown isOpen={isOpen} onNetworkSelect={handleNetworkSelect} disabled={disabled} />
      </div>
    </div>
  );
};
