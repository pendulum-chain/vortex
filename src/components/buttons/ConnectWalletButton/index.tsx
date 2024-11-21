import { Networks } from '../../../hooks/useGetNetworkIcon';
import { useNetwork } from '../../../contexts/network';
import { EVMWalletButton } from '../EVMWalletButton';
import { PolkadotWalletButton } from '../PolkadotWalletButton';

export const ConnectWalletButton = () => {
  const { selectedNetwork } = useNetwork();

  if (selectedNetwork === Networks.assetHub) {
    return <PolkadotWalletButton />;
  }

  return <EVMWalletButton />;
};
