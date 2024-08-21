import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FC } from 'preact/compat';

interface SwapSubmitButtonProps {
  text: string;
  disabled: boolean;
  pending: boolean;
}
export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text, disabled, pending }) => (
  <ConnectButton.Custom>
    {({ account, chain, openConnectModal, authenticationStatus, mounted }) => {
      const ready = mounted && authenticationStatus !== 'loading';
      const connected =
        ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

      const showInDisabledState = disabled || pending;

      return (
        <div>
          {(() => {
            if (!connected) {
              return (
                <button
                  onClick={openConnectModal}
                  type="button"
                  className="w-full mt-5 text-white bg-blue-700 btn rounded-xl"
                >
                  Connect Wallet
                </button>
              );
            }

            return (
              <button
                className="w-full mt-5 text-white bg-blue-700 btn rounded-xl disabled:text-neutral-400 disabled:bg-neutral-100"
                disabled={showInDisabledState}
              >
                {pending && <span className="loading loading-spinner loading-sm"></span>}
                {text}
              </button>
            );
          })()}
        </div>
      );
    }}
  </ConnectButton.Custom>
);
