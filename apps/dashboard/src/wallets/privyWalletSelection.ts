export interface PrivyWalletCandidate {
  address: string;
  type: string;
  walletClientType?: string;
}

export interface RegisteredPrivyWallet {
  address: string;
  providerWalletId: string;
}

function isPrivyEmbeddedWallet(wallet: PrivyWalletCandidate): boolean {
  return wallet.type === "ethereum" && (wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2");
}

export function selectPrivyEmbeddedWallet<T extends PrivyWalletCandidate>(
  wallets: T[],
  registeredWallet?: RegisteredPrivyWallet
): T | undefined {
  if (!registeredWallet) {
    return wallets.find(isPrivyEmbeddedWallet);
  }

  const registeredAddress = registeredWallet.address.toLowerCase();
  return wallets.find(wallet => isPrivyEmbeddedWallet(wallet) && wallet.address.toLowerCase() === registeredAddress);
}
