import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  AssetHubToken,
  EphemeralAccountType,
  EPaymentMethod,
  FiatToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import * as feeDistributionNamespace from "../../../transactions/common/feeDistribution";
import * as pendulumCleanupNamespace from "../../../transactions/pendulum/cleanup";

const sharedReal = { ...sharedNamespace };
const feeDistributionReal = { ...feeDistributionNamespace };
const pendulumCleanupReal = { ...pendulumCleanupNamespace };

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createAssethubToPendulumXCM: async () => ({ kind: "assethub-xcm" }),
  createNablaTransactionsForOfframp: async () => ({
    approve: { extrinsicOptions: { kind: "approve-options" }, transaction: "nabla-approve" },
    swap: { extrinsicOptions: { kind: "swap-options" }, transaction: "nabla-swap" }
  }),
  createPendulumToMoonbeamTransfer: async () => ({ kind: "moonbeam-xcm" }),
  encodeSubmittableExtrinsic: (value: { kind: string }) => `encoded:${value.kind}`
}));
mock.module("../../../transactions/common/feeDistribution", () => ({
  ...feeDistributionReal,
  createSubstrateFeeDistributionTransaction: async () => "fee-distribution"
}));
mock.module("../../../transactions/pendulum/cleanup", () => ({
  ...pendulumCleanupReal,
  preparePendulumCleanupTransaction: async () => ({ kind: "pendulum-cleanup" })
}));

const { brlOfframpAssethubUsdcFlow } = await import("../flows/brl-offramp-assethub-usdc");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../transactions/common/feeDistribution", () => ({ ...feeDistributionReal }));
  mock.module("../../../transactions/pendulum/cleanup", () => ({ ...pendulumCleanupReal }));
});

const REQUEST = {
  from: Networks.AssetHub,
  inputAmount: "100",
  inputCurrency: AssetHubToken.USDC,
  network: Networks.AssetHub,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};

function prepare(accounts: Record<string, unknown>) {
  return brlOfframpAssethubUsdcFlow.prepareTxs({
    accounts,
    metadata: {
      blocks: {
        assethubOfframpSource: { inputAmountRaw: "100000000" },
        aveniaOfframpFee: {},
        aveniaPendulumOfframp: { pendulumCurrencyId: { XCM: 2 }, transferAmountRaw: "499000000000000000000" },
        distributeFees: {},
        fundEphemeral: {},
        nablaSwap: { inputAmountForSwapRaw: "99000000", outputAmountRaw: "499000000000000000000" },
        subsidizePostSwap: {},
        subsidizePreSwap: {}
      },
      globals: {
        fees: { usd: { anchor: "1", network: "0", partnerMarkup: "0", total: "1", vortex: "0" } },
        partner: null,
        request: REQUEST
      }
    } as never,
    quote: { ...REQUEST, outputAmount: "498" } as never,
    registrationFacts: {
      assethubOfframpSource: { userAddress: "5user" },
      aveniaPendulumOfframp: {
        brlaEvmAddress: "0x1111111111111111111111111111111111111111",
        pixDestination: "pix-key",
        receiverTaxId: "12345678900",
        taxId: "12345678901"
      }
    } as never,
    userId: "user-1"
  });
}

describe("AssetHub USDC to BRL transaction parity", () => {
  it("requires only the Substrate ephemeral capability", async () => {
    await expect(prepare({})).rejects.toThrow("Substrate accounts");
  });

  it("preserves user authority, Pendulum nonces, XCM, state, and cleanup", async () => {
    const prepared = await prepare({
      [EphemeralAccountType.Substrate]: { address: "5substrate", type: EphemeralAccountType.Substrate }
    });
    expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.network, tx.signer, tx.nonce, tx.txData])).toEqual([
      ["assethubToPendulum", Networks.AssetHub, "5user", 0, "encoded:assethub-xcm"],
      ["distributeFees", Networks.Pendulum, "5substrate", 0, "fee-distribution"],
      ["nablaApprove", Networks.Pendulum, "5substrate", 1, "nabla-approve"],
      ["nablaSwap", Networks.Pendulum, "5substrate", 2, "nabla-swap"],
      ["pendulumToMoonbeamXcm", Networks.Pendulum, "5substrate", 3, "encoded:moonbeam-xcm"],
      ["pendulumCleanup", Networks.Pendulum, "5substrate", 4, "encoded:pendulum-cleanup"]
    ]);
    expect(prepared.stateMeta).toMatchObject({
      blockState: {
        assethubOfframpSource: { userAddress: "5user" },
        aveniaPendulumOfframp: {
          brlaEvmAddress: "0x1111111111111111111111111111111111111111",
          pixDestination: "pix-key",
          receiverTaxId: "12345678900",
          taxId: "12345678901"
        },
        nablaSwap: {
          approveExtrinsicOptions: { kind: "approve-options" },
          softMinimumOutputRaw: expect.any(String),
          swapExtrinsicOptions: { kind: "swap-options" }
        }
      },
      phaseFlow: ["initial", ...brlOfframpAssethubUsdcFlow.phases, "complete"],
      substrateEphemeralAddress: "5substrate"
    });
    expect(prepared.stateMeta.evmEphemeralAddress).toBeUndefined();
  });
});
