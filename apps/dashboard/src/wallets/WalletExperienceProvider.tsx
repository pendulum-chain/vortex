import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { type WalletMode, WalletsAPI, type WalletsResponse } from "@/services/api/wallets.api";
import { useAuthStore } from "@/stores/auth.store";
import { privyWalletConfig } from "./config";
import { createExternalSigningAdapter } from "./externalSigningAdapter";
import { setActiveWalletSigningAdapter } from "./signingAdapter";
import { type WalletExperience, WalletExperienceContext } from "./WalletExperienceContext";

const LazyPrivyWalletRuntime = lazy(async () => {
  const module = await import("./PrivyWalletRuntime");
  return { default: module.PrivyWalletProviderRuntime };
});

export function WalletExperienceProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const [pendingMode, setPendingMode] = useState<WalletMode>();
  const [autoCreateEmbedded, setAutoCreateEmbedded] = useState(false);

  const walletsQuery = useQuery({
    enabled: Boolean(user),
    queryFn: ({ signal }) => WalletsAPI.getWallets(signal),
    queryKey: ["wallets", user?.userId],
    staleTime: 30_000
  });

  const storedMode = pendingMode ?? walletsQuery.data?.mode ?? null;
  const mode = storedMode === "privy_embedded" && !privyWalletConfig.enabled ? "external" : storedMode;
  const embeddedActive = privyWalletConfig.enabled && storedMode === "privy_embedded";

  const connectExternalWallet = useCallback(async () => {
    if (storedMode === "privy_embedded") {
      const response = await WalletsAPI.setMode("external");
      setPendingMode(response.mode);
      queryClient.setQueryData<WalletsResponse>(["wallets", user?.userId], current => ({
        mode: response.mode,
        wallets: current?.wallets ?? []
      }));
    }
    await open({ view: "Connect" });
  }, [open, queryClient, storedMode, user?.userId]);

  const onModeChange = useCallback(
    (nextMode: WalletMode) => {
      setPendingMode(nextMode);
      queryClient.setQueryData<WalletsResponse>(["wallets", user?.userId], current => ({
        mode: nextMode,
        wallets: current?.wallets ?? []
      }));
    },
    [queryClient, user?.userId]
  );

  const externalAdapter = useMemo(() => (address ? createExternalSigningAdapter(address) : null), [address]);
  const externalValue = useMemo<WalletExperience>(
    () => ({
      activateSigner: () => setActiveWalletSigningAdapter(externalAdapter),
      address,
      canSignOfframp: true,
      canUseAsOnrampDestination: true,
      canUseEmbeddedWallet: privyWalletConfig.provisioningEnabled,
      connectExternalWallet,
      connected: isConnected && Boolean(address),
      createEmbeddedWallet: async () => {
        if (!privyWalletConfig.provisioningEnabled) {
          throw new Error("Embedded wallets are not enabled in this environment");
        }
        setAutoCreateEmbedded(true);
        setPendingMode("privy_embedded");
      },
      creatingEmbeddedWallet: false,
      exportEmbeddedWallet: async () => {
        throw new Error("Select your embedded wallet before exporting it");
      },
      mode,
      ready: !walletsQuery.isLoading,
      switchToExternalWallet: connectExternalWallet
    }),
    [address, connectExternalWallet, externalAdapter, isConnected, mode, walletsQuery.isLoading]
  );

  if (embeddedActive) {
    return (
      <Suspense fallback={null}>
        <LazyPrivyWalletRuntime
          appId={privyWalletConfig.appId}
          autoCreate={autoCreateEmbedded}
          clientId={privyWalletConfig.clientId}
          connectExternalWallet={connectExternalWallet}
          onAutoCreateHandled={() => setAutoCreateEmbedded(false)}
          onModeChange={onModeChange}
        >
          {children}
        </LazyPrivyWalletRuntime>
      </Suspense>
    );
  }

  return <WalletExperienceContext value={externalValue}>{children}</WalletExperienceContext>;
}
