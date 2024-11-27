import { Networks, useNetwork } from '../../../contexts/network';
import { EVMWalletButton } from '../EVMWalletButton';
import { PolkadotWalletButton } from '../PolkadotWalletButton';

export const ConnectWalletButton = ({ customStyles }: { customStyles?: string }) => {
  const { selectedNetwork } = useNetwork();

  if (selectedNetwork === Networks.AssetHub) {
    return <PolkadotWalletButton customStyles={customStyles} />;
  }

  return <EVMWalletButton customStyles={customStyles} />;
};
