import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@xstate/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useRampActor } from "../contexts/rampState";
import { WalletMode, WalletsResponse, WalletsService } from "../services/api/wallets.service";
import { AuthService } from "../services/auth";
import { cdpWidgetConfig, isCdpEnabledForCurrentFrame, isCdpProvisioningEnabledForCurrentFrame } from "./config";
import { createExternalSigningAdapter } from "./externalSigningAdapter";
import { setActiveEvmWalletSigningAdapter } from "./signingAdapter";
import { WidgetEvmWallet, WidgetWalletContext } from "./WidgetWalletContext";

const LazyCdpWidgetWalletRuntime = lazy(async () => {
  const module = await import("./CdpWidgetWalletRuntime");
  return { default: module.CdpWidgetWalletProviderRuntime };
});

function accessTokenSnapshot(): string {
  return AuthService.getTokens()?.accessToken ?? "";
}

function subscribeToAuth(listener: () => void): () => void {
  return AuthService.subscribe(listener);
}

export function WidgetWalletProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useSyncExternalStore(subscribeToAuth, accessTokenSnapshot, () => "");
  const userId = AuthService.getUserId();
  const authenticated = accessToken.length > 0 && Boolean(userId);
  const sessionKey = authenticated && userId ? userId : "anonymous";

  return (
    <WidgetWalletSession authenticated={authenticated} key={sessionKey} userId={userId}>
      {children}
    </WidgetWalletSession>
  );
}

function WidgetWalletSession({
  authenticated,
  children,
  userId
}: {
  authenticated: boolean;
  children: React.ReactNode;
  userId: string | null;
}) {
  const rampActor = useRampActor();
  const walletSetupRequested = useSelector(rampActor, state => state.matches("EmbeddedWallet"));
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

  useEffect(() => () => setActiveEvmWalletSigningAdapter(null), []);

  const storedMode = pendingMode ?? walletsQuery.data?.mode ?? null;
  const mode = storedMode === "cdp_embedded" && !isCdpEnabledForCurrentFrame ? "external" : storedMode;
  const embeddedActive =
    isCdpEnabledForCurrentFrame && authenticated && (storedMode === "cdp_embedded" || walletSetupRequested);
  const registeredWallet = walletsQuery.data?.wallets.find(
    wallet => wallet.provider === "cdp" && wallet.chainType === "ethereum" && wallet.status === "active"
  );

  const connectExternalWallet = useCallback(async () => {
    if (storedMode === "cdp_embedded") {
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
      canExportEmbeddedWallet: false,
      canUseEmbeddedWallet: isCdpProvisioningEnabledForCurrentFrame,
      connectExternalWallet,
      connected: isConnected && Boolean(evmAddress),
      createEmbeddedWallet: () => rampActor.send({ type: "REQUEST_EMBEDDED_WALLET" }),
      creatingEmbeddedWallet: walletSetupRequested,
      embeddedUnavailableReason:
        cdpWidgetConfig.enabled && !isCdpEnabledForCurrentFrame
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
        <LazyCdpWidgetWalletRuntime
          connectExternalWallet={connectExternalWallet}
          mode="cdp_embedded"
          onModeChange={onModeChange}
          projectId={cdpWidgetConfig.projectId}
          registeredWallet={registeredWallet}
        >
          {children}
        </LazyCdpWidgetWalletRuntime>
      </Suspense>
    );
  }

  return <WidgetWalletContext value={externalValue}>{children}</WidgetWalletContext>;
}
