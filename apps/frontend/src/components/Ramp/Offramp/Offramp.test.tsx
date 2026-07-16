// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePartnerStore } from "../../../stores/partnerStore";
import { useQuoteFormStore } from "../../../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../../../stores/quote/useQuoteStore";
import { useRampDirectionStore } from "../../../stores/rampDirectionStore";
import { createFakeRampActor } from "../../../test/fakeRampActor";
import { buildQuoteResponse } from "../../../test/fixtures";
import "../../../test/i18n";
import { API_BASE_URL, server } from "../../../test/msw-server";

// Same module-level fakes as Onramp.test.tsx: no wallet connected, no router mounted.
// All mocked hooks return module-level singletons — a fresh object per render would
// re-trigger effects that depend on them (infinite quote re-fetch).
const stubs = {
  account: { address: undefined, chain: undefined, chainId: undefined },
  appKit: { close: vi.fn(), open: vi.fn() },
  appKitAccount: { address: undefined, isConnected: false },
  appKitNetwork: { caipNetwork: undefined, chainId: undefined, switchNetwork: vi.fn() },
  events: { trackEvent: vi.fn() },
  network: {
    networkSelectorDisabled: false,
    selectedNetwork: "base",
    setNetworkSelectorDisabled: vi.fn(),
    setSelectedNetwork: vi.fn()
  },
  polkadotWallet: { walletAccount: undefined },
  router: { navigate: vi.fn() },
  signMessage: { signMessageAsync: vi.fn() },
  switchChain: { switchChainAsync: vi.fn() }
};

vi.mock("wagmi", () => ({
  useAccount: () => stubs.account,
  useSignMessage: () => stubs.signMessage,
  useSwitchChain: () => stubs.switchChain
}));

vi.mock("../../../wagmiConfig", () => ({ wagmiConfig: { chains: [] } }));

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => stubs.appKit,
  useAppKitAccount: () => stubs.appKitAccount,
  useAppKitNetwork: () => stubs.appKitNetwork
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  useParams: () => ({}),
  useRouter: () => stubs.router,
  useSearch: () => ({})
}));

const fakeRampActor = createFakeRampActor();
vi.mock("../../../contexts/rampState", () => ({
  useRampActor: () => fakeRampActor
}));

vi.mock("../../../contexts/network", () => ({
  useNetwork: () => stubs.network
}));

vi.mock("../../../contexts/events", () => ({
  useEventsContext: () => stubs.events
}));

vi.mock("../../../contexts/polkadotWallet", () => ({
  usePolkadotWalletState: () => stubs.polkadotWallet
}));

import { Offramp } from "./index";

const quoteRequests: Array<Record<string, unknown>> = [];

describe("Offramp quote form (SELL)", () => {
  beforeEach(() => {
    localStorage.clear();
    quoteRequests.length = 0;
    useRampDirectionStore.setState({ activeDirection: RampDirection.SELL });
    useQuoteFormStore.setState({
      fiatToken: FiatToken.BRL,
      inputAmount: "100",
      lastConstraintDirection: RampDirection.SELL,
      onChainToken: EvmToken.USDC
    });
    useQuoteStore.setState({ error: null, exchangeRate: 0, loading: false, outputAmount: undefined, quote: undefined });
    usePartnerStore.setState({ apiKey: null, partnerId: null });
  });

  it("requests a SELL quote and shows the fiat output; asks to connect a wallet before selling", async () => {
    server.use(
      http.post(`${API_BASE_URL}/quotes`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        quoteRequests.push(body);
        return HttpResponse.json(
          buildQuoteResponse({
            inputAmount: body.inputAmount as string,
            inputCurrency: body.inputCurrency as never,
            outputAmount: "480.7",
            outputCurrency: body.outputCurrency as never,
            rampType: body.rampType as RampDirection
          })
        );
      })
    );
    render(<Offramp />);

    expect(screen.getByText("You sell")).toBeInTheDocument();
    expect(screen.getByText("You receive")).toBeInTheDocument();

    await waitFor(() => expect(quoteRequests.length).toBeGreaterThanOrEqual(1));
    expect(quoteRequests[0]).toMatchObject({
      inputAmount: "100",
      inputCurrency: EvmToken.USDC,
      outputCurrency: FiatToken.BRL,
      rampType: RampDirection.SELL
    });

    await waitFor(() =>
      expect((document.querySelector('input[name="outputAmount"]') as HTMLInputElement).value).toContain("480.7")
    );

    // No wallet is connected, so the submit slot shows the connect-wallet button instead of "Sell".
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell" })).not.toBeInTheDocument();
  });

  it("rewrites a backend minimum-limit rejection into a readable message with the backend's limit", async () => {
    server.use(
      http.post(`${API_BASE_URL}/quotes`, () =>
        HttpResponse.json({ error: "Output amount below minimum SELL limit of 25.00 BRL" }, { status: 400 })
      )
    );
    render(<Offramp />);

    expect(await screen.findByText("Minimum sell amount is 25 BRL.")).toBeInTheDocument();
  });
});
