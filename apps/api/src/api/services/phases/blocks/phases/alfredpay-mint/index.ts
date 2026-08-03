import { ALFREDPAY_EVM_TOKEN, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { AlfredpayOnrampMintExecutor } from "./execution";
import { startAlfredpayMint } from "./lifecycle";
import { type AlfredpayMintRegistrationFacts, registerAlfredpayMint } from "./registration";
import { AlfredpayMintContext, type AlfredpayOnrampFiat, simulateAlfredpayMint } from "./simulation";
import { prepareAlfredpayMintTxs } from "./transactions";

export const AlfredpayMint: Phase<
  typeof AlfredpayMintContext,
  PhaseIO<AlfredpayOnrampFiat, "fiat">,
  PhaseIO<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>,
  AlfredpayMintRegistrationFacts
> = {
  context: AlfredpayMintContext,
  executors: [new AlfredpayOnrampMintExecutor()],
  externalOperations: {
    start: {
      provider: "alfredpay",
      // The start call refreshes provider quoteId/expiration and persists them
      // in its own result. Fingerprint only invariant financial inputs so a
      // confirmed replay returns that result instead of conflicting with the
      // metadata mutation caused by the first call.
      request: ctx => ({
        destinationAddress: ctx.state.destinationAddress,
        fee: ctx.metadata.fee,
        inputAmount: ctx.quote.inputAmount,
        inputAmountRaw: ctx.metadata.inputAmountRaw,
        inputCurrency: ctx.quote.inputCurrency,
        outputAmountRaw: ctx.metadata.outputAmountRaw,
        userId: ctx.userId,
        userState: ctx.ownState
      })
    }
  },
  name: "AlfredpayMint",
  phases: ["alfredpayOnrampMint"],
  prepareTxs: prepareAlfredpayMintTxs,
  register: registerAlfredpayMint,
  simulate: simulateAlfredpayMint,
  start: startAlfredpayMint
};
