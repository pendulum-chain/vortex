import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import type RampState from "../../../../../models/rampState.model";
import * as quoteTicketNamespace from "../../../../../models/quoteTicket.model";
import { settlementBalanceKey } from "../core/settlement";

const sharedReal = { ...sharedNamespace };
const quoteTicketReal = { ...quoteTicketNamespace };
const sendRawTransactionMock = mock(async () => "0xunexpected");
const waitForTransactionReceiptMock = mock(async () => ({ status: "success" as const }));
const findQuoteMock = mock(async () => undefined as unknown);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken: mock(async () => new Big("1000000")),
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        sendRawTransaction: sendRawTransactionMock,
        waitForTransactionReceipt: waitForTransactionReceiptMock
      })
    })
  }
}));

mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuoteMock }
}));

const { SquidRouterSwapExecutor } = await import("../phases/squid-router-swap/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
});

beforeEach(() => {
  sendRawTransactionMock.mockClear();
  waitForTransactionReceiptMock.mockClear();
  findQuoteMock.mockClear();
});

describe("SquidRouterSwapExecutor", () => {
  it("waits for a persisted swap hash without broadcasting the swap again", async () => {
    const ephemeralAddress = "0x3434343434343434343434343434343434343434";
    const approveHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const swapHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const sourceToken = sharedReal.getOnChainTokenDetails(Networks.Polygon, EvmToken.USDT);
    const destinationToken = sharedReal.getOnChainTokenDetails(Networks.Polygon, EvmToken.USDC);
    if (!sourceToken || sourceToken.type !== "evm" || !destinationToken || destinationToken.type !== "evm") {
      throw new Error("Polygon token configuration missing for SquidRouterSwapExecutor test");
    }

    findQuoteMock.mockResolvedValue({
      metadata: {
        blocks: {
          squidRouterSwap: {
            fromNetwork: Networks.Polygon,
            fromToken: sourceToken.erc20AddressSourceChain,
            inputAmountRaw: "1000000",
            toNetwork: Networks.Polygon,
            toToken: destinationToken.erc20AddressSourceChain
          }
        }
      },
      outputCurrency: EvmToken.USDC
    });

    const state = {
      currentPhase: "squidRouterSwap",
      id: "ramp-with-persisted-swap",
      presignedTxs: [
        { network: Networks.Polygon, nonce: 0, phase: "squidRouterApprove", signer: ephemeralAddress, txData: "0xapprove" },
        { network: Networks.Polygon, nonce: 1, phase: "squidRouterSwap", signer: ephemeralAddress, txData: "0xswap" }
      ],
      state: {
        evmEphemeralAddress: ephemeralAddress,
        squidRouterApproveHash: approveHash,
        squidRouterSwapHash: swapHash,
        transactionPlan: {
          settlementBaselines: {
            [settlementBalanceKey(Networks.Polygon, ephemeralAddress, destinationToken.erc20AddressSourceChain)]: "0"
          }
        }
      },
      update: mock(async () => state)
    } as unknown as RampState;

    const result = await new SquidRouterSwapExecutor().execute(state);

    expect(result).toBe(state);
    expect(sendRawTransactionMock).not.toHaveBeenCalled();
    expect(waitForTransactionReceiptMock).toHaveBeenCalledTimes(2);
    expect(waitForTransactionReceiptMock).toHaveBeenNthCalledWith(1, { hash: approveHash });
    expect(waitForTransactionReceiptMock).toHaveBeenNthCalledWith(2, { hash: swapHash });
  });
});
