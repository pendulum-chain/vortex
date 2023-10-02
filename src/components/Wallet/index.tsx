import { ArrowLeftOnRectangleIcon } from '@heroicons/react/20/solid';
import { WalletSelect } from '@talismn/connect-components';
import { Button, Divider, Dropdown } from 'react-daisyui';
import { isMobile } from 'react-device-detect';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { useAccountBalance } from '../../shared/useAccountBalance';
import { CopyableAddress } from '../PublicKey';
import { Skeleton } from '../Skeleton';
import NovaWallet from './NovaWallet';
import WalletConnect from './WalletConnect';

const OpenWallet = ({ dAppName }: { dAppName: string }): JSX.Element => {
  const { walletAccount, setWalletAccount, removeWalletAccount } = useGlobalState();
  const { wallet, address } = walletAccount || {};
  const { query, balance } = useAccountBalance();
  const { ss58Format, tokenSymbol } = useNodeInfoState().state;

  return (
    <>
      {address ? (
        <Dropdown vertical="end" end>
          <Button
            size="sm"
            color="ghost"
            className="text-sm border-base-300 border-1 bg-base-200 min-h-[2.1rem] h-auto px-1 sm:px-3"
            title={wallet?.title}
            type="button"
          >
            {query.isLoading ? (
              <Skeleton className="bg-[rgba(0,0,0,.06)] px-2 py-1 mr-2 hidden sm:flex">10000.00 TKN</Skeleton>
            ) : (
              <span className="items-center bg-[rgba(0,0,0,.06)] px-2 py-0.5 mr-2 rounded-lg hidden sm:flex">
                {balance} {tokenSymbol}
              </span>
            )}
            {walletAccount?.name}
            <img src={wallet?.logo?.src || ''} className="w-[20px] ml-2" alt={wallet?.logo?.alt || ''} />
          </Button>
          <Dropdown.Menu className="card card-compact text-center bg-base-200 shadow-lg min-w-[240px] p-3">
            <div className="text-sm text-neutral-400">{walletAccount?.name}</div>
            <div className="text-neutral-500">
              <CopyableAddress
                publicKey={ss58Format ? getAddressForFormat(address, ss58Format) : address}
                variant="short"
                inline={true}
              />
            </div>
            <p className="truncate my-6 text-center text-2xl font-bold" title={`${balance} ${tokenSymbol}`}>
              {balance} {tokenSymbol}
            </p>
            <Button className="bg-base-300" size="sm" onClick={removeWalletAccount}>
              <ArrowLeftOnRectangleIcon className="mr-2 w-5" />
              Disconnect
            </Button>
          </Dropdown.Menu>
        </Dropdown>
      ) : (
        <>
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
                {isMobile && (
                  <>
                    <NovaWallet setWalletAccount={setWalletAccount} />
                    <Divider className="before:bg-transparent after:bg-transparent h-2" />
                  </>
                )}
                <WalletConnect setWalletAccount={setWalletAccount} />
              </>
            }
          />
        </>
      )}
    </>
  );
};

export default OpenWallet;
