import { apiClient } from "./api-client";

export type WalletMode = "external" | "privy_embedded" | null;

export interface ProfileWallet {
  address: `0x${string}`;
  chainType: "ethereum";
  createdAt: string;
  id: string;
  lastUsedAt: string;
  provider: "privy";
  providerWalletId: string;
  status: "active";
}

export interface WalletsResponse {
  mode: WalletMode;
  wallets: ProfileWallet[];
}

export const WalletsAPI = {
  getWallets: (signal?: AbortSignal) => apiClient.get<WalletsResponse>("/wallets", { signal }),
  registerPrivyWallet: (input: { address: string; providerWalletId: string }) =>
    apiClient.post<{ mode: "privy_embedded"; wallet: ProfileWallet }>("/wallets/privy", input),
  setMode: (mode: WalletMode) => apiClient.patch<{ mode: WalletMode }>("/wallets/mode", { mode })
};
