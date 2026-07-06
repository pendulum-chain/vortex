// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiatToken, QuoteError, RampDirection } from "@vortexfi/shared";
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

// The quote form pulls in wallet, router, and app-level contexts. They are irrelevant
// to the quote flow itself, so they are faked at module level: no wallet is connected
// and no router is mounted. All mocked hooks return module-level singletons — hooks
// like useQuoteService put e.g. trackEvent in effect dependency arrays, so a fresh
// object per render causes an infinite re-fetch loop.
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

// wagmiConfig runs createAppKit() at import time; keep it out of the test module graph.
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

import { Onramp } from "./index";

const quoteRequests: Array<Record<string, unknown>> = [];

function mockQuoteEndpoint() {
  server.use(
    http.post(`${API_BASE_URL}/quotes`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      quoteRequests.push(body);
      return HttpResponse.json(
        buildQuoteResponse({
          inputAmount: body.inputAmount as string,
          inputCurrency: body.inputCurrency as never,
          outputAmount: "25.5",
          outputCurrency: body.outputCurrency as never,
          rampType: body.rampType as RampDirection
        })
      );
    })
  );
}

const getInputAmountField = () => document.querySelector('input[name="inputAmount"]') as HTMLInputElement;
const getOutputAmountField = () => document.querySelector('input[name="outputAmount"]') as HTMLInputElement;

describe("Onramp quote form (BUY)", () => {
  beforeEach(() => {
    localStorage.clear();
    quoteRequests.length = 0;
    useRampDirectionStore.setState({ activeDirection: RampDirection.BUY });
    useQuoteFormStore.setState({
      fiatToken: FiatToken.BRL,
      inputAmount: "100",
      lastConstraintDirection: RampDirection.BUY
    });
    useQuoteStore.setState({ error: null, exchangeRate: 0, loading: false, outputAmount: undefined, quote: undefined });
    // null (as opposed to undefined) means "resolved from the URL: no partner" — quotes may be fetched.
    usePartnerStore.setState({ apiKey: null, partnerId: null });
  });

  it("requests a quote for the current amount and displays the received output amount", async () => {
    mockQuoteEndpoint();
    render(<Onramp />);

    expect(screen.getByText("You pay")).toBeInTheDocument();
    expect(screen.getByText("You receive")).toBeInTheDocument();

    await waitFor(() => expect(quoteRequests.length).toBeGreaterThanOrEqual(1));
    expect(quoteRequests[0]).toMatchObject({
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      rampType: RampDirection.BUY
    });

    await waitFor(() => expect(getOutputAmountField().value).toContain("25.5"));

    // A fresh, matching quote enables the submit button.
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled());
  });

  it("re-requests a quote with the new amount after the user edits the input (debounced)", async () => {
    mockQuoteEndpoint();
    const user = userEvent.setup();
    render(<Onramp />);

    await waitFor(() => expect(quoteRequests.length).toBeGreaterThanOrEqual(1));

    const input = getInputAmountField();
    await user.clear(input);
    await user.type(input, "250");

    await waitFor(() => expect(quoteRequests.some(r => r.inputAmount === "250")).toBe(true), { timeout: 4000 });
  });

  it("shows the backend quote error and keeps the submit button disabled", async () => {
    server.use(
      http.post(`${API_BASE_URL}/quotes`, () =>
        HttpResponse.json({ error: QuoteError.InputAmountTooLowToCoverFees }, { status: 400 })
      )
    );
    render(<Onramp />);

    expect(await screen.findByText("Input amount too low. Please try a larger amount.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });
});
