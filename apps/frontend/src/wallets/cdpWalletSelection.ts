export interface CdpEvmAccount {
  address: string;
}

export interface CdpUser {
  evmAccountObjects?: CdpEvmAccount[];
  userId: string;
}

export interface RegisteredCdpWallet {
  address: string;
  providerWalletId: string;
}

export function selectCdpEmbeddedWallet<T extends CdpUser>(
  user: T | null,
  registeredWallet?: RegisteredCdpWallet
): CdpEvmAccount | undefined {
  if (!user) return undefined;
  if (!registeredWallet) {
    return user.evmAccountObjects?.[0];
  }

  if (user.userId !== registeredWallet.providerWalletId) return undefined;
  const registeredAddress = registeredWallet.address.toLowerCase();
  return user.evmAccountObjects?.find(account => account.address.toLowerCase() === registeredAddress);
}
