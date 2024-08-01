import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FC } from 'preact/compat';
import { Link } from 'react-router-dom';

interface SwapSubmitButtonProps {
  text: string;
  disabled: boolean;
}
export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text, disabled }) => (
  <ConnectButton.Custom>
    {({ account, chain, openConnectModal, authenticationStatus, mounted }) => {
      const ready = mounted && authenticationStatus !== 'loading';
      const connected =
        ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

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
              <Link to="/progress" className="w-full mt-5 text-white bg-blue-700 btn rounded-xl" disabled={disabled}>
                {text}
              </Link>
              // <button className="w-full mt-5 text-white bg-blue-700 btn rounded-xl" disabled={disabled}>
              //   {text}
              // </button>
            );
          })()}
        </div>
      );
    }}
  </ConnectButton.Custom>
);
