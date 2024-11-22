import { Networks, useNetwork } from '../../../contexts/network';
import { EVMWalletButton } from '../EVMWalletButton';
import { PolkadotWalletButton } from '../PolkadotWalletButton';

export const ConnectWalletButton = () => {
  const { selectedNetwork } = useNetwork();

  if (selectedNetwork === Networks.AssetHub) {
    return <PolkadotWalletButton />;
  }

  return <EVMWalletButton />;
};
