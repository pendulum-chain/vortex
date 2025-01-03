import { isNetworkEVM } from '../../../helpers/networks';
import { useNetwork } from '../../../contexts/network';
import { EVMWalletButton } from '../EVMWalletButton';
import { PolkadotWalletButton } from '../PolkadotWalletButton';

export const ConnectWalletButton = ({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) => {
  const { selectedNetwork } = useNetwork();

  if (!isNetworkEVM(selectedNetwork)) {
    return <PolkadotWalletButton customStyles={customStyles} hideIcon={hideIcon} />;
  }

  return <EVMWalletButton customStyles={customStyles} hideIcon={hideIcon} />;
};
