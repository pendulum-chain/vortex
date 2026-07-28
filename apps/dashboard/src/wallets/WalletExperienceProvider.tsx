import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  const userId = useAuthStore(state => state.user?.userId);
  return (
    <WalletExperienceSession key={userId ?? "anonymous"} userId={userId}>
      {children}
    </WalletExperienceSession>
  );
}

function WalletExperienceSession({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const [pendingMode, setPendingMode] = useState<WalletMode>();
  const [autoCreateEmbedded, setAutoCreateEmbedded] = useState(false);

  const walletsQuery = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => WalletsAPI.getWallets(signal),
    queryKey: ["wallets", userId],
    staleTime: 30_000
  });

  useEffect(() => () => setActiveWalletSigningAdapter(null), []);

  const storedMode = pendingMode ?? walletsQuery.data?.mode ?? null;
  const mode = storedMode === "privy_embedded" && !privyWalletConfig.enabled ? "external" : storedMode;
  const embeddedActive = privyWalletConfig.enabled && storedMode === "privy_embedded";
  const registeredWallet = walletsQuery.data?.wallets.find(
    wallet => wallet.provider === "privy" && wallet.chainType === "ethereum" && wallet.status === "active"
  );

  const connectExternalWallet = useCallback(async () => {
    if (storedMode === "privy_embedded") {
      const response = await WalletsAPI.setMode("external");
      setPendingMode(response.mode);
      queryClient.setQueryData<WalletsResponse>(["wallets", userId], current => ({
        mode: response.mode,
        wallets: current?.wallets ?? []
      }));
    }
    await open({ view: "Connect" });
  }, [open, queryClient, storedMode, userId]);

  const onModeChange = useCallback(
    (nextMode: WalletMode) => {
      setPendingMode(nextMode);
      queryClient.setQueryData<WalletsResponse>(["wallets", userId], current => ({
        mode: nextMode,
        wallets: current?.wallets ?? []
      }));
    },
    [queryClient, userId]
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
          registeredWallet={registeredWallet}
        >
          {children}
        </LazyPrivyWalletRuntime>
      </Suspense>
    );
  }

  return <WalletExperienceContext value={externalValue}>{children}</WalletExperienceContext>;
}
