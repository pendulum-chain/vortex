import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ConnectKitProvider } from "connectkit";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import "@/App.css";
import { queryClient } from "@/lib/queryClient";
import { wagmiConfig } from "@/lib/wagmi";
import { getRouter } from "@/router";

const router = getRouter();

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <ConnectKitProvider mode="auto">
        <RouterProvider router={router} />
      </ConnectKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
