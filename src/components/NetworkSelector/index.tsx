import { Dropdown } from 'react-daisyui';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { NetworkIcon } from '../NetworkIcon';
import { NetworkIconType } from '../../hooks/useGetNetworkIcon';
import { Networks, useNetwork } from '../../contexts/network';

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const NetworkSelector = () => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();

  const handleChainSelect = (chainId: NetworkIconType) => {
    setSelectedNetwork(chainId);
  };

  return (
    <Dropdown className="mr-2 ">
      <Dropdown.Toggle className="rounded-3xl">
        <NetworkIcon chainId={selectedNetwork} className="w-5 h-5" />
        <ChevronDownIcon className="block w-4 h-4 ml-1" />
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-48 p-2 mt-2 shadow-lg bg-base-100 rounded-box">
        {Object.values(Networks).map((networkId) => (
          <Dropdown.Item
            key={networkId}
            onClick={() => handleChainSelect(networkId)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-base-200"
          >
            <NetworkIcon chainId={networkId} className="w-5 h-5" />
            <span>{capitalize(networkId)}</span>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
