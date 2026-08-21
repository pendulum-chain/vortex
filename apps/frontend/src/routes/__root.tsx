import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "react-toastify/dist/ReactToastify.css";
import "../../App.css";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts, useParams } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { PropsWithChildren } from "react";
import { WagmiProvider } from "wagmi";
import { ToastPopover } from "../components/ToastPopover";
import { EventsProvider } from "../contexts/events";
import { NetworkProvider } from "../contexts/network";
import { PolkadotNodeProvider } from "../contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "../contexts/polkadotWallet";
import { PersistentRampStateProvider } from "../contexts/rampState";
import { Language } from "../translations/helpers";
import { wagmiConfig } from "../wagmiConfig";

const GTM_ID = "GTM-T8JZSLD8";

const GTM_SNIPPET = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  head: () => ({
    links: [
      { href: "/favicon-32x32.png", rel: "icon", sizes: "32x32", type: "image/png" },
      { href: "/favicon-16x16.png", rel: "icon", sizes: "16x16", type: "image/png" },
      { href: "/favicon.ico", rel: "icon", type: "image/x-icon" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon", sizes: "180x180" },
      { href: "/site.webmanifest", rel: "manifest" },
      { href: "https://fonts.googleapis.com", rel: "preconnect" },
      { crossOrigin: "anonymous", href: "https://fonts.gstatic.com", rel: "preconnect" },
      {
        href: "https://fonts.googleapis.com/css2?family=Red+Hat+Display:ital,wght@0,300..900;1,300..900&display=swap",
        rel: "stylesheet"
      }
    ],
    meta: [{ charSet: "utf-8" }, { content: "width=device-width, initial-scale=1.0", name: "viewport" }, { title: "Vortex" }],
    scripts: [{ children: GTM_SNIPPET }]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: PropsWithChildren) {
  // `lang` has to reflect the active locale for crawlers reading the prerendered HTML.
  const { locale } = useParams({ strict: false });

  return (
    <html lang={locale ?? Language.English} translate="no">
      <head>
        <HeadContent />
      </head>
      <body style={{ backgroundColor: "#fff" }}>
        <noscript>
          <iframe
            height="0"
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
            width="0"
          />
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={Route.useRouteContext().queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      {/* This stack is ordered by dependency, not by preference — each provider's body consumes
          the ones above it, and every one of them renders on the prerendered marketing pages too:
          `BaseLayout` calls `useInitTokenBalances`/`useStepper` and `EventsProvider` calls
          `useVortexAccount`, both of which reach for wagmi, the ramp actor and the Polkadot wallet
          state. Wagmi and the ramp actor also back `NetworkProvider`'s own body. Moving any of them
          under the widget route would throw on every marketing route until those consumers are made
          provider-optional. Only the AppKit modal is browser-scoped (see wagmiConfig.ts). */}
      <WagmiProvider config={wagmiConfig}>
        <PersistentRampStateProvider>
          <PolkadotNodeProvider>
            <PolkadotWalletStateProvider>
              <NetworkProvider>
                <EventsProvider>
                  <Outlet />
                  <ToastPopover />
                  <div id="modals">
                    {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
                  </div>
                  {/* The devtools read router context from their own module copy, which is empty
                      during the SSR render, so they only mount once hydrated. */}
                  <ClientOnly>
                    <TanStackRouterDevtools />
                  </ClientOnly>
                </EventsProvider>
              </NetworkProvider>
            </PolkadotWalletStateProvider>
          </PolkadotNodeProvider>
        </PersistentRampStateProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
