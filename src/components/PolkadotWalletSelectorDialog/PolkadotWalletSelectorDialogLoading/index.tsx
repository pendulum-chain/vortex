import { useTranslation } from 'react-i18next';

interface PolkadotWalletSelectorDialogLoadingProps {
  selectedWallet: string;
}

export const PolkadotWalletSelectorDialogLoading = ({ selectedWallet }: PolkadotWalletSelectorDialogLoadingProps) => {
  const { t } = useTranslation();

  return (
    <article className="flex flex-col items-center justify-center">
      <span className="loading loading-dots loading-lg"></span>
      <h1 className="text-2xl">{t('components.polkadotWalletSelectorDialogLoading.title')}</h1>
      <p className="mt-2.5 w-52 text-center text-sm">
        {t('components.polkadotWalletSelectorDialogLoading.description', { selectedWallet })}
      </p>
    </article>
  );
};
