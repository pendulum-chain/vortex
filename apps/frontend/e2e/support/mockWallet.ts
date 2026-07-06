import { Page } from "@playwright/test";

export const MOCK_WALLET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const MOCK_WALLET_NAME = "E2E Mock Wallet";

// Injects a minimal EIP-1193 provider announced via EIP-6963 before the app loads.
// AppKit is configured with enableEIP6963, so the provider shows up in the connect
// modal as an installed browser wallet — no app code changes needed.
// The wallet's chain defaults to Base; journeys that live on another network (e.g.
// Polygon offramps) pass the matching chainIdHex so no mid-flow chain switch is needed.
export async function injectMockWallet(page: Page, options: { chainIdHex?: string } = {}) {
  await page.addInitScript(
    ({ address, name, chainIdHex }) => {
      // biome-ignore lint/suspicious/noExplicitAny: minimal EIP-1193 stub
      const listeners: Record<string, Array<(...args: any[]) => void>> = {};
      const provider = {
        isMetaMask: false,
        // biome-ignore lint/suspicious/noExplicitAny: minimal EIP-1193 stub
        on: (event: string, cb: (...args: any[]) => void) => {
          (listeners[event] ??= []).push(cb);
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal EIP-1193 stub
        removeListener: (event: string, cb: (...args: any[]) => void) => {
          listeners[event] = (listeners[event] ?? []).filter(l => l !== cb);
        },
        request: async ({ method }: { method: string }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [address];
            case "eth_chainId":
              return chainIdHex;
            case "net_version":
              return String(Number(chainIdHex));
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_requestPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "personal_sign":
            case "eth_signTypedData_v4":
              return `0x${"ab".repeat(65)}`;
            // Journeys that submit user transactions (e.g. offramp squidRouter steps)
            // get a plausible transaction hash back without touching a chain.
            case "eth_sendTransaction":
              return `0x${"cd".repeat(32)}`;
            case "eth_getTransactionReceipt":
              return {
                blockHash: `0x${"ef".repeat(32)}`,
                blockNumber: "0x1",
                status: "0x1",
                transactionHash: `0x${"cd".repeat(32)}`
              };
            case "eth_estimateGas":
              return "0x5208";
            case "eth_gasPrice":
              return "0x3b9aca00";
            case "eth_getTransactionCount":
              return "0x0";
            case "eth_getBalance":
              return "0xde0b6b3a7640000"; // 1 ETH
            case "eth_blockNumber":
              return "0x1";
            default:
              return null;
          }
        }
      };

      const info = Object.freeze({
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIvPg==",
        name,
        rdns: "co.vortexfinance.e2e",
        uuid: "e2e00000-0000-4000-8000-000000000001"
      });
      const announce = () =>
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();

      // Also expose as the legacy injected provider for connectors that look for it.
      // biome-ignore lint/suspicious/noExplicitAny: window.ethereum has no typed slot here
      (window as any).ethereum = provider;
    },
    { address: MOCK_WALLET_ADDRESS, chainIdHex: options.chainIdHex ?? "0x2105", name: MOCK_WALLET_NAME }
  );
}
