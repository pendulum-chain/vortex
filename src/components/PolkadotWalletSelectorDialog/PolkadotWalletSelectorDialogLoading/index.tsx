interface PolkadotWalletSelectorDialogLoadingProps {
  selectedWallet: string;
}

export const PolkadotWalletSelectorDialogLoading = ({ selectedWallet }: PolkadotWalletSelectorDialogLoadingProps) => (
  <article className="flex flex-col items-center justify-center">
    <span className="loading loading-dots loading-lg"></span>
    <h1 className="text-2xl">Connecting wallet</h1>
    <p className="mt-2.5 w-52 text-center text-sm">Please approve {selectedWallet} and approve transaction.</p>
  </article>
);
