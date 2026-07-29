import {
  createMoonbeamToPendulumXCM,
  EphemeralAccountType,
  EvmToken,
  encodeSubmittableExtrinsic,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  getPendulumDetails,
  Networks
} from "@vortexfi/shared";
import { prepareMoonbeamCleanupTransaction } from "../../../../transactions/moonbeam/cleanup";
import { requireAccount } from "../../core/accounts";
import { defineContext } from "../../core/metadata";
import type { Phase, PhaseIO } from "../../core/types";
import { MoonbeamToPendulumXcmExecutor } from "./execution";

export interface MoonbeamToPendulumXcmMetadata {
  inputAmountRaw: string;
  outputAmountRaw: string;
  pendulumCurrencyId: ReturnType<typeof getPendulumDetails>["currencyId"];
}

export const MoonbeamToPendulumXcmContext = defineContext<MoonbeamToPendulumXcmMetadata>()("moonbeamToPendulumXcm");

export const MoonbeamToPendulumXcm: Phase<
  typeof MoonbeamToPendulumXcmContext,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Moonbeam>,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>
> = {
  context: MoonbeamToPendulumXcmContext,
  executors: [new MoonbeamToPendulumXcmExecutor()],
  name: "MoonbeamToPendulumXcm",
  phases: ["moonbeamToPendulumXcm"],
  async prepareTxs(ctx) {
    const evm = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
    const substrate = requireAccount(ctx.accounts, EphemeralAccountType.Substrate);
    const token = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
    const xcm = await createMoonbeamToPendulumXCM(
      substrate.address,
      ctx.ownMetadata.inputAmountRaw,
      token.moonbeamErc20Address
    );
    return {
      intents: [
        {
          lane: "main",
          network: Networks.Moonbeam,
          nonceSpan: 2,
          phase: "moonbeamToPendulumXcm",
          signer: evm.address,
          txData: encodeSubmittableExtrinsic(xcm)
        },
        {
          lane: "cleanup",
          network: Networks.Moonbeam,
          phase: "moonbeamCleanup",
          signer: evm.address,
          txData: encodeSubmittableExtrinsic(await prepareMoonbeamCleanupTransaction())
        }
      ]
    };
  },
  async simulate(input, ctx) {
    const pendulum = getPendulumDetails(FiatToken.BRL);
    ctx.addNote(`MoonbeamToPendulumXcm: ${input.amount.toFixed()} BRLA to Pendulum`);
    return {
      metadata: {
        inputAmountRaw: input.amountRaw,
        outputAmountRaw: input.amountRaw,
        pendulumCurrencyId: pendulum.currencyId
      },
      output: {
        amount: input.amount,
        amountRaw: input.amountRaw,
        chain: Networks.Pendulum,
        token: FiatToken.BRL
      }
    };
  }
};
