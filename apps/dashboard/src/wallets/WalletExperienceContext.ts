import { createContext, use } from "react";
import type { WalletMode } from "@/services/api/wallets.api";

export interface WalletExperience {
  activateSigner: () => void;
  address?: `0x${string}`;
  canSignOfframp: boolean;
  canUseAsOnrampDestination: boolean;
  canUseEmbeddedWallet: boolean;
  connectExternalWallet: () => Promise<void>;
  connected: boolean;
  createEmbeddedWallet: () => Promise<void>;
  creatingEmbeddedWallet: boolean;
  error?: string;
  exportEmbeddedWallet: () => Promise<void>;
  mode: WalletMode;
  ready: boolean;
  switchToExternalWallet: () => Promise<void>;
}

export const WalletExperienceContext = createContext<WalletExperience | null>(null);

export function useWalletExperience(): WalletExperience {
  const value = use(WalletExperienceContext);
  if (!value) {
    throw new Error("useWalletExperience must be used inside WalletExperienceProvider");
  }
  return value;
}
