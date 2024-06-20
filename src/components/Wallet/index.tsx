import { Button, Divider } from 'react-daisyui';
import { useGlobalState } from '../../GlobalStateProvider';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const OpenWallet = ({
  dAppName,
  ss58Format,
  offrampStarted,
}: {
  dAppName: string;
  ss58Format: number;
  offrampStarted: boolean;
}) => {
  const { walletAccount, setWalletAccount, removeWalletAccount } = useGlobalState();
  const { wallet, address } = walletAccount || {};

  return address ? (
    <div className="wallet-info">
      <div className="wallet-header">
        <img src={wallet?.logo?.src || ''} className="wallet-icon" alt={wallet?.logo?.alt || 'Wallet Logo'} />
        <span className="wallet-address">{ss58Format ? getAddressForFormat(address, ss58Format) : address}</span>
      </div>
      <div>
        {!offrampStarted ? (
          <Button className="disconnect-btn" size="sm" onClick={removeWalletAccount}>
            Disconnect
          </Button>
        ) : null}
      </div>
    </div>
  ) : (
    <ConnectButton />
  );
};

export default OpenWallet;
