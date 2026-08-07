import { apiClient } from "./api-client";

export type WalletMode = "external" | "cdp_embedded" | null;

export interface ProfileWallet {
  address: `0x${string}`;
  chainType: "ethereum";
  createdAt: string;
  id: string;
  lastUsedAt: string;
  provider: "cdp";
  providerWalletId: string;
  status: "active";
}

export interface WalletsResponse {
  mode: WalletMode;
  wallets: ProfileWallet[];
}

export const WalletsService = {
  getWallets: (signal?: AbortSignal) => apiClient.get<WalletsResponse>("/wallets", { signal }),
  registerCdpWallet: (input: { address: string; cdpUserId: string }) =>
    apiClient.post<{ mode: "cdp_embedded"; wallet: ProfileWallet }>("/wallets/cdp", input),
  setMode: (mode: WalletMode) => apiClient.patch<{ mode: WalletMode }>("/wallets/mode", { mode })
};
