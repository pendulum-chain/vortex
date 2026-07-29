import {
  createPendulumToMoonbeamTransfer,
  EphemeralAccountType,
  encodeSubmittableExtrinsic,
  FiatToken,
  Networks
} from "@vortexfi/shared";
import { requireAccount } from "../../core/accounts";
import type { Phase, PhaseIO } from "../../core/types";
import { AveniaOfframpPayoutExecutor } from "../avenia-offramp-payout/execution";
import {
  type AveniaOfframpPayoutRegistrationFacts,
  type AveniaOfframpPayoutRegistrationInput,
  registerAveniaOfframpPayout
} from "../avenia-offramp-payout/registration";
import { PendulumToAveniaXcmExecutor } from "./execution";
import { AveniaPendulumOfframpContext, type AveniaPendulumOfframpMetadata, simulateAveniaPendulumOfframp } from "./simulation";

export const AveniaPendulumOfframp: Phase<
  typeof AveniaPendulumOfframpContext,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  AveniaOfframpPayoutRegistrationFacts,
  AveniaOfframpPayoutRegistrationInput
> = {
  context: AveniaPendulumOfframpContext,
  executors: [new PendulumToAveniaXcmExecutor(), new AveniaOfframpPayoutExecutor()],
  name: "AveniaPendulumOfframp",
  phases: ["pendulumToMoonbeamXcm", "brlaPayoutOnBase"],
  async prepareTxs(ctx) {
    const substrate = requireAccount(ctx.accounts, EphemeralAccountType.Substrate);
    const facts = ctx.ownRegistrationFacts;
    if (!facts) throw new Error("AveniaPendulumOfframp: missing registration facts");
    const transaction = await createPendulumToMoonbeamTransfer(
      facts.brlaEvmAddress,
      ctx.ownMetadata.transferAmountRaw,
      ctx.ownMetadata.pendulumCurrencyId
    );
    return {
      intents: [
        {
          lane: "main",
          network: Networks.Pendulum,
          phase: "pendulumToMoonbeamXcm",
          signer: substrate.address,
          txData: encodeSubmittableExtrinsic(transaction)
        }
      ],
      state: facts
    };
  },
  register: registerAveniaOfframpPayout as unknown as Phase<
    typeof AveniaPendulumOfframpContext,
    PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
    PhaseIO<typeof FiatToken.BRL, "fiat">,
    AveniaOfframpPayoutRegistrationFacts,
    AveniaOfframpPayoutRegistrationInput
  >["register"],
  simulate: simulateAveniaPendulumOfframp as (
    input: PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
    ctx: import("../../core/types").PhaseCtx
  ) => Promise<import("../../core/types").PhaseResult<PhaseIO<typeof FiatToken.BRL, "fiat">, AveniaPendulumOfframpMetadata>>
};
