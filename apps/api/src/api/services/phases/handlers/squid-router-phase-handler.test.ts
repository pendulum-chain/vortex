// eslint-disable-next-line import/no-unresolved
import {afterAll, beforeEach, describe, expect, it, mock} from "bun:test";
import Big from "big.js";
// Captured before mock.module so afterAll can restore the real package —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import * as rampServiceNamespace from "../../ramp/ramp.service";

// Value copies taken before mock.module runs — the namespaces themselves are
// live bindings that would reflect the mocks once installed.
const sharedReal = { ...sharedNamespace };
const rampServiceReal = { ...rampServiceNamespace };

const Networks = {
  Base: "base",
  Moonbeam: "moonbeam",
  Polygon: "polygon"
} as const;

const EvmNetworks = Networks;

const EvmToken = {
  USDC: "USDC"
} as const;

const FiatToken = {
  BRL: "BRL",
  EURC: "EUR",
  USD: "USD"
} as const;

const RampDirection = {
  BUY: "BUY",
  SELL: "SELL"
} as const;

const RampPhase = {
  squidRouterSwap: "squidRouterSwap"
} as const;

const EVM_EPHEMERAL_ADDRESS = "0x1111111111111111111111111111111111111111";
const EURE_POLYGON_ADDRESS = "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6";
const USDC_BASE_ADDRESS = "0x3333333333333333333333333333333333333333";
const APPROVE_TX = "0xapprove";
const SWAP_TX = "0xswap";
const APPROVE_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SWAP_HASH = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const sendRawTransaction = mock(async ({ serializedTransaction }: { serializedTransaction: string }) => {
  if (serializedTransaction === APPROVE_TX) {
    return APPROVE_HASH;
  }
  if (serializedTransaction === SWAP_TX) {
    return SWAP_HASH;
  }
  throw new Error(`Unexpected transaction ${serializedTransaction}`);
});
const waitForTransactionReceipt = mock(async () => ({ status: "success" }));
const getTransactionCount = mock(async () => 0);
const checkEvmBalanceForToken = mock(async () => Big(1000));
const getEvmBalance = mock(async () => Big(0));
const getOnChainTokenDetails = mock((network: string, token: string) => ({
  assetSymbol: "Monerium EURe",
  decimals: 18,
  erc20AddressSourceChain: token,
  isNative: false,
  network
}));
const isEvmTokenDetails = mock(() => true);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        getTransactionCount,
        sendRawTransaction,
        waitForTransactionReceipt
      })
    })
  },
  ALFREDPAY_EVM_TOKEN: "USDT",
  EvmNetworks,
  EvmToken,
  EvmTokenDetails: {},
  evmTokenConfig: {
    [Networks.Polygon]: {
      EURC: {
        erc20AddressSourceChain: EURE_POLYGON_ADDRESS
      }
    }
  },
  FiatToken,
  getEvmBalance,
  getOnChainTokenDetails,
  getNetworkFromDestination: (destination: string) =>
    Object.values(Networks).includes(destination as (typeof Networks)[keyof typeof Networks]) ? destination : undefined,
  getNetworkId: (network: string) => {
    if (network === Networks.Base) return 8453;
    if (network === Networks.Polygon) return 137;
    if (network === Networks.Moonbeam) return 1284;
    return undefined;
  },
  isAlfredpayToken: () => false,
  isEvmTokenDetails,
  Networks,
  RampDirection,
  RampPhase
}));

mock.module("../../ramp/ramp.service", () => ({
  default: {
    appendErrorLog: mock(async () => undefined)
  }
}));

const { default: QuoteTicket } = await import("../../../../models/quoteTicket.model");
const { SquidRouterPhaseHandler } = await import("./squid-router-phase-handler");

const realQuoteTicketFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../ramp/ramp.service", () => ({ ...rampServiceReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
});

let quote: {
  inputCurrency: string;
  metadata: Record<string, any>;
  network: string;
  outputCurrency: string;
  to: string;
};

QuoteTicket.findByPk = mock(async () => quote as any) as typeof QuoteTicket.findByPk;

function makeState(overrides: Record<string, any> = {}) {
  const state = {
    currentPhase: "squidRouterSwap",
    errorLogs: [],
    from: "sepa",
    get() {
      const { get: _get, update: _update, ...data } = this;
      return data;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs: [
      {
        meta: {},
        network: Networks.Polygon,
        nonce: 0,
        phase: "squidRouterApprove",
        signer: EVM_EPHEMERAL_ADDRESS,
        txData: APPROVE_TX
      },
      {
        meta: {},
        network: Networks.Polygon,
        nonce: 1,
        phase: "squidRouterSwap",
        signer: EVM_EPHEMERAL_ADDRESS,
        txData: SWAP_TX
      }
    ],
    quoteId: "quote-1",
    state: {
      evmEphemeralAddress: EVM_EPHEMERAL_ADDRESS
    },
    to: Networks.Base,
    type: RampDirection.BUY,
    async update(updateData: Record<string, any>) {
      Object.assign(this, updateData);
      return this;
    },
    ...overrides
  };
  return state as any;
}

describe("SquidRouterPhaseHandler", () => {
  beforeEach(() => {
    sendRawTransaction.mockClear();
    waitForTransactionReceipt.mockClear();
    getTransactionCount.mockClear();
    checkEvmBalanceForToken.mockClear();
    getEvmBalance.mockClear();
    getOnChainTokenDetails.mockClear();
    isEvmTokenDetails.mockClear();
  });

  it("submits Squid approve and swap for Monerium EUR onramp to Base USDC", async () => {
    quote = {
      inputCurrency: FiatToken.EURC,
      metadata: {
        evmToEvm: {
          fromNetwork: Networks.Polygon,
          fromToken: EURE_POLYGON_ADDRESS,
          inputAmountRaw: "1000",
          toNetwork: Networks.Base,
          toToken: USDC_BASE_ADDRESS
        },
        moneriumMint: {
          outputAmountRaw: "1000"
        }
      },
      // quote.network for a BUY ramp is by construction the destination network
      // (quote.controller getNetworkFromDestination(to)); the pre-settlement snapshot
      // must read the destination-chain balance, so this pins Base, not Polygon.
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      to: Networks.Base
    };

    const handler = new SquidRouterPhaseHandler();
    const updatedState = await handler.execute(makeState());

    expect(sendRawTransaction).toHaveBeenCalledTimes(2);
    expect(getOnChainTokenDetails).toHaveBeenCalledWith(Networks.Base, EvmToken.USDC);
    expect(getEvmBalance).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction.mock.calls[0][0]).toEqual({ serializedTransaction: APPROVE_TX });
    expect(sendRawTransaction.mock.calls[1][0]).toEqual({ serializedTransaction: SWAP_TX });
    expect(updatedState.state).toMatchObject({
      preSettlementBalance: "0",
      squidRouterApproveHash: APPROVE_HASH,
      squidRouterSwapHash: SWAP_HASH
    });
    // The handler no longer transitions explicitly; the PhaseProcessor advances via phaseFlow.
    expect(updatedState.currentPhase).toBe("squidRouterSwap");
  });

  it("skips Squid for same-chain Base USDC passthrough quotes", async () => {
    quote = {
      inputCurrency: FiatToken.BRL,
      metadata: {
        aveniaTransfer: {
          outputAmountRaw: "1000"
        },
        evmToEvm: {
          fromNetwork: Networks.Base,
          fromToken: USDC_BASE_ADDRESS,
          inputAmountRaw: "1000",
          toNetwork: Networks.Base,
          toToken: USDC_BASE_ADDRESS
        }
      },
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      to: Networks.Base
    };

    const handler = new SquidRouterPhaseHandler();
    const updatedState = await handler.execute(
      makeState({
        presignedTxs: []
      })
    );

    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(getOnChainTokenDetails).not.toHaveBeenCalled();
    expect(updatedState.currentPhase).toBe("finalSettlementSubsidy");
  });
});
