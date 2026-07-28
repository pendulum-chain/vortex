import {
  type LinkedAccountWithMetadata,
  PrivyProvider,
  useCreateWallet,
  useExportWallet,
  usePrivy,
  useSendTransaction,
  useSignTypedData,
  useSyncJwtBasedAuthState,
  useWallets
} from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToBytes } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi";
import { type ProfileWallet, type WalletMode, WalletsAPI, type WalletsResponse } from "@/services/api/wallets.api";
import { AuthService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { privyWalletConfig } from "./config";
import { selectPrivyEmbeddedWallet } from "./privyWalletSelection";
import { setActiveWalletSigningAdapter, type WalletSigningAdapter } from "./signingAdapter";
import { type WalletExperience, WalletExperienceContext } from "./WalletExperienceContext";

interface PrivyWalletRuntimeProps {
  autoCreate: boolean;
  children: React.ReactNode;
  connectExternalWallet: () => Promise<void>;
  onAutoCreateHandled: () => void;
  onModeChange: (mode: WalletMode) => void;
  registeredWallet?: Pick<ProfileWallet, "address" | "providerWalletId">;
}

interface PrivyWalletProviderRuntimeProps extends PrivyWalletRuntimeProps {
  appId: string;
  clientId?: string;
}

export function PrivyWalletRuntime({
  autoCreate,
  children,
  connectExternalWallet,
  onAutoCreateHandled,
  onModeChange,
  registeredWallet
}: PrivyWalletRuntimeProps) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const { user: privyUser } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { signTypedData } = useSignTypedData();
  const { ready: walletsReady, wallets } = useWallets();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  const getExternalJwt = useCallback(async () => AuthService.getTokens()?.accessToken, []);
  const subscribeToAuth = useCallback((onChange: () => void) => AuthService.subscribe(onChange), []);
  const { state: authState } = useSyncJwtBasedAuthState({
    enabled: Boolean(user),
    getExternalJwt,
    onError: authError => setError(`Embedded wallet authentication failed: ${authError.message}`),
    subscribe: subscribeToAuth
  });

  const embeddedWallet = selectPrivyEmbeddedWallet(wallets, registeredWallet);
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;
  const linkedEmbeddedWallet = privyUser?.linkedAccounts.find(
    (account): account is Extract<LinkedAccountWithMetadata, { type: "wallet" }> =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      (account.walletClientType === "privy" || account.walletClientType === "privy-v2") &&
      account.address.toLowerCase() === walletAddress?.toLowerCase() &&
      (!registeredWallet || account.id === registeredWallet.providerWalletId)
  );
  const registeredWalletUnavailable =
    walletsReady && authState.status === "done" && Boolean(registeredWallet) && (!embeddedWallet || !linkedEmbeddedWallet);
  const address = registeredWalletUnavailable ? undefined : walletAddress;

  const signingAdapter = useMemo<WalletSigningAdapter | null>(() => {
    if (!address) return null;
    return {
      address,
      kind: "privy_embedded",
      sendTransaction: async transaction => {
        const result = await sendTransaction(
          {
            chainId: transaction.chainId,
            data: transaction.data,
            gasLimit: transaction.gas,
            to: transaction.to,
            value: transaction.value
          },
          { address, sponsor: privyWalletConfig.gasPolicy === "sponsored" }
        );
        return result.hash;
      },
      signTypedData: async typedData => {
        const domain = {
          ...(typedData.domain.chainId !== undefined ? { chainId: Number(typedData.domain.chainId) } : {}),
          ...(typedData.domain.name ? { name: typedData.domain.name } : {}),
          ...(typedData.domain.salt ? { salt: Uint8Array.from(hexToBytes(typedData.domain.salt)).buffer } : {}),
          ...(typedData.domain.verifyingContract ? { verifyingContract: typedData.domain.verifyingContract } : {}),
          ...(typedData.domain.version ? { version: typedData.domain.version } : {})
        };
        const result = await signTypedData(
          {
            domain,
            message: typedData.message,
            primaryType: typedData.primaryType,
            types: typedData.types
          },
          { address }
        );
        return result.signature as `0x${string}`;
      },
      waitForTransaction: async (hash, chainId) => {
        const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId, hash });
        return receipt.transactionHash;
      }
    };
  }, [address, sendTransaction, signTypedData]);

  const register = useCallback(
    async (wallet: { address: string; id?: string | null }) => {
      if (!wallet.id) {
        throw new Error("Privy did not return an embedded wallet ID");
      }
      const registered = await WalletsAPI.registerPrivyWallet({
        address: wallet.address,
        providerWalletId: wallet.id
      });
      queryClient.setQueryData<WalletsResponse>(["wallets", user?.userId], current => ({
        mode: registered.mode,
        wallets: current?.wallets.some(item => item.id === registered.wallet.id)
          ? (current.wallets ?? [])
          : [...(current?.wallets ?? []), registered.wallet]
      }));
      onModeChange("privy_embedded");
    },
    [onModeChange, queryClient, user?.userId]
  );

  const createEmbeddedWallet = useCallback(async () => {
    setCreating(true);
    setError(undefined);
    try {
      if (registeredWalletUnavailable) {
        throw new Error("The registered embedded wallet is not available in the current Privy session");
      }
      if (embeddedWallet && linkedEmbeddedWallet) {
        await register(linkedEmbeddedWallet);
      } else {
        const created = await createWallet();
        await register(created);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the embedded wallet");
    } finally {
      setCreating(false);
    }
  }, [createWallet, embeddedWallet, linkedEmbeddedWallet, register, registeredWalletUnavailable]);

  const autoCreateStarted = useRef(false);
  useEffect(() => {
    if (!autoCreate) {
      autoCreateStarted.current = false;
    }
  }, [autoCreate]);

  useEffect(() => {
    if (!autoCreate || autoCreateStarted.current || !walletsReady || authState.status !== "done") {
      return;
    }
    autoCreateStarted.current = true;
    void createEmbeddedWallet().finally(onAutoCreateHandled);
  }, [authState.status, autoCreate, createEmbeddedWallet, onAutoCreateHandled, walletsReady]);

  const switchToExternalWallet = useCallback(async () => {
    await WalletsAPI.setMode("external");
    onModeChange("external");
    await connectExternalWallet();
  }, [connectExternalWallet, onModeChange]);

  const value = useMemo<WalletExperience>(
    () => ({
      activateSigner: () => setActiveWalletSigningAdapter(signingAdapter),
      address,
      canSignOfframp: privyWalletConfig.offrampEnabled,
      canUseAsOnrampDestination: privyWalletConfig.onrampEnabled,
      canUseEmbeddedWallet: privyWalletConfig.provisioningEnabled,
      connectExternalWallet,
      connected: Boolean(address),
      createEmbeddedWallet,
      creatingEmbeddedWallet: creating,
      error:
        error ??
        (registeredWalletUnavailable
          ? "The registered embedded wallet is not available in the current Privy session"
          : undefined),
      exportEmbeddedWallet: async () => {
        if (!address) throw new Error("No embedded wallet is available to export");
        await exportWallet({ address });
      },
      mode: "privy_embedded",
      ready: walletsReady,
      switchToExternalWallet
    }),
    [
      address,
      connectExternalWallet,
      createEmbeddedWallet,
      creating,
      error,
      exportWallet,
      registeredWalletUnavailable,
      signingAdapter,
      switchToExternalWallet,
      walletsReady
    ]
  );

  return <WalletExperienceContext value={value}>{children}</WalletExperienceContext>;
}

export function PrivyWalletProviderRuntime({ appId, clientId, ...runtimeProps }: PrivyWalletProviderRuntimeProps) {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          showWalletUIs: true
        }
      }}
    >
      <PrivyWalletRuntime {...runtimeProps} />
    </PrivyProvider>
  );
}
