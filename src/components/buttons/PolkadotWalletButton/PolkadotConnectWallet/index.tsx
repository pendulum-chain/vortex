import { useState } from 'preact/hooks';
import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { PolkadotWalletSelectorDialog } from '../../../PolkadotWalletSelectorDialog';
import { useEventsContext } from '../../../../contexts/events';

export const PolkadotConnectWallet = ({ customStyles }: { customStyles?: string }) => {
  const [showPolkadotDialog, setShowPolkadotDialog] = useState(false);
  const { handleUserClickWallet } = useEventsContext();

  return (
    <>
      <button
        onClick={() => {
          handleUserClickWallet();
          setShowPolkadotDialog(true);
        }}
        type="button"
        className={`btn-vortex-secondary btn rounded-3xl group ${customStyles}`}
      >
        <p className="flex">
          Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
        </p>
        <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
      </button>
      <PolkadotWalletSelectorDialog visible={showPolkadotDialog} onClose={() => setShowPolkadotDialog(false)} />
    </>
  );
};
