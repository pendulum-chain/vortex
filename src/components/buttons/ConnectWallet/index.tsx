import { PlayCircleIcon } from '@heroicons/react/20/solid';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEventsContext } from '../../../contexts/events';

export function ConnectWallet() {
  const { handleUserClickWallet } = useEventsContext();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={() => {
                      openConnectModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="text-white bg-pink-600 border-pink-600 btn rounded-3xl"
                  >
                    <p className="flex">
                      Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
                    </p>
                    <PlayCircleIcon className="w-5" />
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={() => {
                      openChainModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="text-white bg-pink-600 border-pink-600 btn rounded-3xl"
                  >
                    Wrong network
                    <PlayCircleIcon className="w-5" />
                  </button>
                );
              }

              return (
                <>
                  <button
                    onClick={() => {
                      openAccountModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="text-white bg-pink-600 border-pink-600 btn rounded-3xl"
                  >
                    <AccountBalanceWalletOutlinedIcon className="w-4" />
                    <p className="hidden font-thin md:block">{account.displayName}</p>
                  </button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
