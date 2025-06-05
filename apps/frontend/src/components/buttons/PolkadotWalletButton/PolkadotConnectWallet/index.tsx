import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../../helpers/cn';
import { PolkadotWalletSelectorDialog } from '../../../PolkadotWalletSelectorDialog';

export const PolkadotConnectWallet = ({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) => {
  const [showPolkadotDialog, setShowPolkadotDialog] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <button
        onClick={() => {
          setShowPolkadotDialog(true);
        }}
        type="button"
        className={cn('btn rounded-3xl group', customStyles || 'btn-vortex-secondary')}
      >
        <p className="flex">
          {t('components.dialogs.connectWallet.connect')} <span className="hidden lg:block lg:ml-1">Wallet</span>
        </p>
        {hideIcon ? <></> : <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
      </button>
      <PolkadotWalletSelectorDialog visible={showPolkadotDialog} onClose={() => setShowPolkadotDialog(false)} />
    </>
  );
};
