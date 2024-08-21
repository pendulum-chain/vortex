import React from 'react';
import { WalletSelect } from '@talismn/connect-components';
import { Button, Divider } from 'react-daisyui';
import { useGlobalState } from '../../GlobalStateProvider';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { CopyableAddress } from '../PublicKey';
import MetamaskWallet from './MetamaskWallet';
import WalletConnect from './WalletConnect';

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

  return (
    <>
      {address ? (
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
        <WalletSelect
          dappName={dAppName}
          open={false}
          showAccountsList={true}
          triggerComponent={
            <Button size="sm" className={`text-sm min-h-[2.1rem] h-auto px-1 sm:px-3`} color="primary" type="button">
              Connect to Wallet
            </Button>
          }
          onAccountSelected={setWalletAccount}
          footer={
            <>
              <MetamaskWallet setWalletAccount={setWalletAccount} />
              <Divider className="before:bg-transparent after:bg-transparent h-2" />
              <WalletConnect />
            </>
          }
        />
      )}
    </>
  );
};

export default OpenWallet;
