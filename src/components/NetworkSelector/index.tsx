import { motion } from 'framer-motion';
import { useState } from 'preact/hooks';

import { NetworkIcon } from '../NetworkIcon';
import { NetworkIcons, NetworkIconType } from '../../hooks/useGetNetworkIcon';
import { useNetwork } from '../../contexts/network';

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const NetworkSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedNetwork, setSelectedNetwork } = useNetwork();

  const handleChainSelect = (chainId: NetworkIconType) => {
    setSelectedNetwork(chainId);
    setIsOpen(false);
  };

  return (
    <div className="relative mr-2">
      <button onClick={() => setIsOpen(!isOpen)} type="button" className="btn rounded-3xl group">
        <NetworkIcon chainId={selectedNetwork} className="w-5 h-5" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : -10 }}
        transition={{ duration: 0.2 }}
        className="absolute w-48 mt-2 overflow-hidden bg-white rounded-lg shadow-lg top-full dark:bg-gray-800"
      >
        {Object.values(NetworkIcons).map((networkId) => (
          <button
            key={networkId}
            onClick={() => handleChainSelect(networkId)}
            className="flex items-center w-full gap-2 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <NetworkIcon chainId={networkId} className="w-5 h-5" />
            <span>{capitalize(networkId)}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
};
