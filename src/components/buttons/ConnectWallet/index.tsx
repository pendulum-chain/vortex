import { PlayCircleIcon } from '@heroicons/react/20/solid';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const ConnectWallet = () => (
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
                  onClick={openConnectModal}
                  type="button"
                  className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
                >
                  Connect Wallet
                  <PlayCircleIcon className="w-5" />
                </button>
              );
            }

            if (chain.unsupported) {
              return (
                <button
                  onClick={openChainModal}
                  type="button"
                  className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
                >
                  Wrong network
                  <PlayCircleIcon className="w-5" />
                </button>
              );
            }

            return (
              <>
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
                >
                  <AccountBalanceWalletOutlinedIcon className="w-4" />
                  <p className="font-thin">{account.displayName}</p>
                </button>
              </>
            );
          })()}
        </div>
      );
    }}
  </ConnectButton.Custom>
);
