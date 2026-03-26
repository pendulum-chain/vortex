import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useMemo } from "react";
import { WagmiProvider } from "wagmi";
import { EventsProvider } from "../../contexts/events";
import { NetworkProvider } from "../../contexts/network";
import { PolkadotNodeProvider } from "../../contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "../../contexts/polkadotWallet";
import { PersistentRampStateProvider } from "../../contexts/rampState";
import { wagmiConfig } from "../../wagmiConfig";

// RouterProvider renders the route tree and doesn't accept children directly.
// We pass inner content through a module-level context so the root route component can render it.
const MockRouterChildrenContext = createContext<ReactNode>(null);

const rootRoute = createRootRoute({
  component: () => {
    const children = useContext(MockRouterChildrenContext);
    return <>{children}</>;
  }
});

const mockRouter = createRouter({ routeTree: rootRoute });

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

  const innerContent = (
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

  return (
    <MockRouterChildrenContext.Provider value={innerContent}>
      <RouterProvider router={mockRouter} />
    </MockRouterChildrenContext.Provider>
  );
};
