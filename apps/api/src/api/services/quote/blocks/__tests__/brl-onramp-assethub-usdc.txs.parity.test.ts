import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import * as feeDistributionNamespace from "../../../transactions/common/feeDistribution";
import * as moonbeamCleanupNamespace from "../../../transactions/moonbeam/cleanup";
import * as pendulumCleanupNamespace from "../../../transactions/pendulum/cleanup";

const sharedReal = { ...sharedNamespace };
const feeDistributionReal = { ...feeDistributionNamespace };
const moonbeamCleanupReal = { ...moonbeamCleanupNamespace };
const pendulumCleanupReal = { ...pendulumCleanupNamespace };

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createMoonbeamToPendulumXCM: async () => ({ kind: "moonbeam-xcm" }),
  createNablaTransactionsForOnramp: async () => ({
    approve: { extrinsicOptions: { kind: "approve-options" }, transaction: "nabla-approve" },
    swap: { extrinsicOptions: { kind: "swap-options" }, transaction: "nabla-swap" }
  }),
  createPendulumToAssethubTransfer: async () => ({ kind: "assethub-xcm" }),
  encodeSubmittableExtrinsic: (value: { kind: string }) => `encoded:${value.kind}`
}));
mock.module("../../../transactions/common/feeDistribution", () => ({
  ...feeDistributionReal,
  createSubstrateFeeDistributionTransaction: async () => "fee-distribution"
}));
mock.module("../../../transactions/moonbeam/cleanup", () => ({
  ...moonbeamCleanupReal,
  prepareMoonbeamCleanupTransaction: async () => ({ kind: "moonbeam-cleanup" })
}));
mock.module("../../../transactions/pendulum/cleanup", () => ({
  ...pendulumCleanupReal,
  preparePendulumCleanupTransaction: async () => ({ kind: "pendulum-cleanup" })
}));

const { brlOnrampAssethubUsdcFlow } = await import("../flows/brl-onramp-assethub-usdc");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../transactions/common/feeDistribution", () => ({ ...feeDistributionReal }));
  mock.module("../../../transactions/moonbeam/cleanup", () => ({ ...moonbeamCleanupReal }));
  mock.module("../../../transactions/pendulum/cleanup", () => ({ ...pendulumCleanupReal }));
});

describe("BRL Avenia to AssetHub USDC transaction parity", () => {
  it("requires both EVM and Substrate capabilities", async () => {
    await expect(
      brlOnrampAssethubUsdcFlow.prepareTxs({
        accounts: { [EphemeralAccountType.EVM]: { address: "0xevm", type: EphemeralAccountType.EVM } },
        destinationAddress: "5destination",
        metadata: {
          blocks: {
            aveniaMint: {},
            distributeFees: {},
            fundEphemeral: {},
            moonbeamToPendulumXcm: { inputAmountRaw: "1" },
            nablaSwap: {},
            pendulumToAssethubXcm: {},
            subsidizePostSwap: {},
            subsidizePreSwap: {}
          },
          globals: { fees: { usd: {} }, partner: null, request: {} }
        } as never,
        quote: {} as never,
        registrationFacts: { aveniaMint: { taxId: "12345678901" } } as never
      })
    ).rejects.toThrow("Substrate ephemeral account");
  });

  it("prepares both signers, exact nonces, phase state, XCM, and cleanup", async () => {
    const request = {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.AssetHub,
      outputCurrency: "USDC",
      rampType: RampDirection.BUY,
      to: Networks.AssetHub
    };
    const prepared = await brlOnrampAssethubUsdcFlow.prepareTxs({
      accounts: {
        [EphemeralAccountType.EVM]: { address: "0xevm", type: EphemeralAccountType.EVM },
        [EphemeralAccountType.Substrate]: { address: "5substrate", type: EphemeralAccountType.Substrate }
      },
      destinationAddress: "5destination",
      metadata: {
        blocks: {
          aveniaMint: {
            mint: {},
            network: Networks.Moonbeam,
            transfer: { outputAmountRaw: "99000000000000000000" }
          },
          distributeFees: {
            anchorFeeUsd: "1",
            network: Networks.Pendulum,
            networkFeeUsd: "0.03",
            outputCurrencyId: { XCM: 12 },
            outputDecimals: 6,
            partnerMarkupUsd: "0",
            totalFeesUsd: "0.13",
            vortexFeeUsd: "0.1"
          },
          fundEphemeral: { network: Networks.Moonbeam, token: "BRLA" },
          moonbeamToPendulumXcm: {
            inputAmountRaw: "99000000000000000000",
            outputAmountRaw: "99000000000000000000",
            pendulumCurrencyId: { XCM: 2 }
          },
          nablaSwap: {
            inputAmountForSwapDecimal: "99",
            inputAmountForSwapRaw: "99000000000000000000",
            inputCurrency: "BRL",
            inputDecimals: 18,
            inputToken: "0xinput",
            network: Networks.Pendulum,
            outputAmountDecimal: new Big("18"),
            outputAmountRaw: "18000000",
            outputCurrency: "USDC",
            outputDecimals: 6,
            outputToken: "0xoutput"
          },
          pendulumToAssethubXcm: {
            inputAmountRaw: "17500000",
            outputAmountRaw: "17472000",
            outputCurrencyId: { XCM: 12 }
          },
          subsidizePostSwap: {},
          subsidizePreSwap: {}
        },
        globals: {
          fees: { usd: { anchor: "1", network: "0.03", partnerMarkup: "0", total: "1.13", vortex: "0.1" } },
          partner: null,
          request
        }
      } as never,
      quote: {
        from: "pix",
        id: "quote",
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.AssetHub,
        outputAmount: "17.472",
        outputCurrency: "USDC",
        partnerId: null,
        pricingPartnerId: null,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      } as never,
      registrationFacts: { aveniaMint: { aveniaTicketId: "ticket", taxId: "12345678901" } } as never
    });

    expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.network, tx.signer, tx.nonce, tx.txData])).toEqual([
      ["moonbeamToPendulumXcm", Networks.Moonbeam, "0xevm", 0, "encoded:moonbeam-xcm"],
      ["nablaApprove", Networks.Pendulum, "5substrate", 0, "nabla-approve"],
      ["nablaSwap", Networks.Pendulum, "5substrate", 1, "nabla-swap"],
      ["distributeFees", Networks.Pendulum, "5substrate", 2, "fee-distribution"],
      ["pendulumToAssethubXcm", Networks.Pendulum, "5substrate", 3, "encoded:assethub-xcm"],
      ["moonbeamCleanup", Networks.Moonbeam, "0xevm", 2, "encoded:moonbeam-cleanup"],
      ["pendulumCleanup", Networks.Pendulum, "5substrate", 4, "encoded:pendulum-cleanup"]
    ]);
    expect(prepared.stateMeta).toMatchObject({
      blockState: {
        aveniaMint: { taxId: "12345678901" },
        nablaSwap: {
          approveExtrinsicOptions: { kind: "approve-options" },
          softMinimumOutputRaw: expect.any(String),
          swapExtrinsicOptions: { kind: "swap-options" }
        }
      },
      destinationAddress: "5destination",
      evmEphemeralAddress: "0xevm",
      substrateEphemeralAddress: "5substrate"
    });
  });
});
