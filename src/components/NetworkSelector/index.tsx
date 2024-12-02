import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { NetworkIcon } from '../NetworkIcon';
import { NetworkIconType } from '../../hooks/useGetNetworkIcon';
import { Networks, useNetwork } from '../../contexts/network';
import { useState, useRef, useEffect } from 'preact/hooks';

const NETWORK_DISPLAY_NAMES: Record<Networks, string> = {
  [Networks.AssetHub]: 'Polkadot AssetHub',
  [Networks.Polygon]: 'Polygon',
};

function networkToDisplayName(network: Networks): string {
  return NETWORK_DISPLAY_NAMES[network] ?? network;
}

interface NetworkButtonProps {
  selectedNetwork: Networks;
  isOpen: boolean;
  onClick: () => void;
}

const NetworkButton = ({ selectedNetwork, isOpen, onClick }: NetworkButtonProps) => (
  <motion.button
    className="flex items-center gap-2 px-4 py-2 rounded-full bg-base-100"
    onClick={onClick}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    <NetworkIcon chainId={selectedNetwork} className="w-5 h-5" />
    {networkToDisplayName(selectedNetwork)}
    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
      <ChevronDownIcon className="block w-4 h-4 ml-1" />
    </motion.div>
  </motion.button>
);

interface NetworkDropdownProps {
  isOpen: boolean;
  onNetworkSelect: (networkId: NetworkIconType) => void;
}

const NetworkDropdown = ({ isOpen, onNetworkSelect }: NetworkDropdownProps) => (
  <AnimatePresence>
    {isOpen && (
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

export const NetworkSelector = () => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const handleNetworkSelect = (networkId: NetworkIconType) => {
    setSelectedNetwork(networkId);
    setIsOpen(false);
  };

  return (
    <div className="relative mr-2" ref={dropdownRef}>
      <NetworkButton selectedNetwork={selectedNetwork} isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
      <NetworkDropdown isOpen={isOpen} onNetworkSelect={handleNetworkSelect} />
    </div>
  );
};
