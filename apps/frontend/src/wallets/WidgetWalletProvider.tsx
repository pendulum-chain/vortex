import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@xstate/react";
import { lazy, Suspense, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useRampActor } from "../contexts/rampState";
import { WalletMode, WalletsResponse, WalletsService } from "../services/api/wallets.service";
import { AuthService } from "../services/auth";
import { isPrivyEnabledForCurrentFrame, isPrivyProvisioningEnabledForCurrentFrame, privyWidgetConfig } from "./config";
import { createExternalSigningAdapter } from "./externalSigningAdapter";
import { setActiveEvmWalletSigningAdapter } from "./signingAdapter";
import { WidgetEvmWallet, WidgetWalletContext } from "./WidgetWalletContext";

const LazyPrivyWidgetWalletRuntime = lazy(async () => {
  const module = await import("./PrivyWidgetWalletRuntime");
  return { default: module.PrivyWidgetWalletProviderRuntime };
});

function accessTokenSnapshot(): string {
  return AuthService.getTokens()?.accessToken ?? "";
}

function subscribeToAuth(listener: () => void): () => void {
  return AuthService.subscribe(listener);
}

export function WidgetWalletProvider({ children }: { children: React.ReactNode }) {
  const rampActor = useRampActor();
  const walletSetupRequested = useSelector(rampActor, state => state.matches("EmbeddedWallet"));
  const accessToken = useSyncExternalStore(subscribeToAuth, accessTokenSnapshot, () => "");
  const userId = AuthService.getUserId();
  const authenticated = accessToken.length > 0 && Boolean(userId);
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const evmAddress = address as `0x${string}` | undefined;
  const { isConnected } = useAppKitAccount();
  const { signMessageAsync } = useSignMessage();
  const { open } = useAppKit();
  const [pendingMode, setPendingMode] = useState<WalletMode>();

  const walletsQuery = useQuery({
    enabled: authenticated,
    queryFn: ({ signal }) => WalletsService.getWallets(signal),
    queryKey: ["wallets", userId],
    staleTime: 30_000
  });

  const storedMode = pendingMode ?? walletsQuery.data?.mode ?? null;
  const mode = storedMode === "privy_embedded" && !isPrivyEnabledForCurrentFrame ? "external" : storedMode;
  const embeddedActive =
    isPrivyEnabledForCurrentFrame && authenticated && (storedMode === "privy_embedded" || walletSetupRequested);

  const connectExternalWallet = useCallback(async () => {
    if (storedMode === "privy_embedded") {
      const response = await WalletsService.setMode("external");
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

  const externalAdapter = useMemo(() => (evmAddress ? createExternalSigningAdapter(evmAddress) : null), [evmAddress]);
  const externalValue = useMemo<WidgetEvmWallet>(
    () => ({
      activateSigner: () => setActiveEvmWalletSigningAdapter(externalAdapter),
      address: evmAddress,
      canUseEmbeddedWallet: isPrivyProvisioningEnabledForCurrentFrame,
      connectExternalWallet,
      connected: isConnected && Boolean(evmAddress),
      createEmbeddedWallet: () => rampActor.send({ type: "REQUEST_EMBEDDED_WALLET" }),
      creatingEmbeddedWallet: walletSetupRequested,
      embeddedUnavailableReason:
        privyWidgetConfig.enabled && !isPrivyEnabledForCurrentFrame
          ? "Open this flow on Vortex to create or use an embedded wallet."
          : undefined,
      exportEmbeddedWallet: async () => {
        throw new Error("Select your embedded wallet before exporting it");
      },
      mode,
      ready: !walletsQuery.isLoading,
      signMessage: message => signMessageAsync({ message }),
      switchToExternalWallet: connectExternalWallet
    }),
    [
      evmAddress,
      connectExternalWallet,
      externalAdapter,
      isConnected,
      mode,
      rampActor,
      signMessageAsync,
      walletSetupRequested,
      walletsQuery.isLoading
    ]
  );

  if (embeddedActive) {
    return (
      <Suspense fallback={null}>
        <LazyPrivyWidgetWalletRuntime
          appId={privyWidgetConfig.appId}
          clientId={privyWidgetConfig.clientId}
          connectExternalWallet={connectExternalWallet}
          mode="privy_embedded"
          onModeChange={onModeChange}
        >
          {children}
        </LazyPrivyWidgetWalletRuntime>
      </Suspense>
    );
  }

  return <WidgetWalletContext value={externalValue}>{children}</WidgetWalletContext>;
}
