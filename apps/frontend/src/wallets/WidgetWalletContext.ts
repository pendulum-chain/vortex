import { createContext, use } from "react";
import { WalletMode } from "../services/api/wallets.service";

export interface WidgetEvmWallet {
  activateSigner: () => void;
  address?: `0x${string}`;
  canUseEmbeddedWallet: boolean;
  connectExternalWallet: () => Promise<void>;
  connected: boolean;
  createEmbeddedWallet: () => void;
  creatingEmbeddedWallet: boolean;
  embeddedUnavailableReason?: string;
  exportEmbeddedWallet: () => Promise<void>;
  mode: WalletMode;
  ready: boolean;
  signMessage: (message: string) => Promise<`0x${string}`>;
  switchToExternalWallet: () => Promise<void>;
}

export const WidgetWalletContext = createContext<WidgetEvmWallet | null>(null);

export function useWidgetWallet(): WidgetEvmWallet {
  const value = use(WidgetWalletContext);
  if (!value) throw new Error("useWidgetWallet must be used inside WidgetWalletProvider");
  return value;
}
