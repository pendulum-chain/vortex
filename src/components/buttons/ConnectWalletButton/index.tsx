import { Networks, useNetwork } from '../../../contexts/network';
import { EVMWalletButton } from '../EVMWalletButton';
import { PolkadotWalletButton } from '../PolkadotWalletButton';

export const ConnectWalletButton = ({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) => {
  const { selectedNetwork } = useNetwork();

  if (selectedNetwork === Networks.AssetHub) {
    return <PolkadotWalletButton customStyles={customStyles} hideIcon={hideIcon} />;
  }

  return <EVMWalletButton customStyles={customStyles} hideIcon={hideIcon} />;
};
