import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useEffect, useMemo } from "react";
import { WagmiProvider } from "wagmi";
import { EventsProvider } from "../../contexts/events";
import { NetworkProvider } from "../../contexts/network";
import { PolkadotNodeProvider } from "../../contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "../../contexts/polkadotWallet";
import { PersistentRampStateProvider } from "../../contexts/rampState";
import { wagmiConfig } from "../../wagmiConfig";

/**
 * MockProviders wraps Storybook stories with all necessary context providers
 * that components need to function properly. This ensures stories have access
 * to the same provider hierarchy as the main application.
 */
export const MockProviders = ({ children }: PropsWithChildren) => {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: {
            retry: false
          },
          queries: {
            retry: false
          }
        }
      }),
    []
  );

  // Mock window.dataLayer for event tracking
  useEffect(() => {
    if (!window.dataLayer) {
      window.dataLayer = [];
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PersistentRampStateProvider>
          <NetworkProvider>
            <PolkadotNodeProvider>
              <PolkadotWalletStateProvider>
                <EventsProvider>{children}</EventsProvider>
              </PolkadotWalletStateProvider>
            </PolkadotNodeProvider>
          </NetworkProvider>
        </PersistentRampStateProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
};
