import { describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, FiatToken, Networks, RampDirection, RampPhase } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { StateMetadata } from "../phases/meta-state-types";
import { RampService } from "./ramp.service";

const createdAt = new Date("2026-06-10T12:31:56.420Z");
const updatedAt = new Date("2026-06-10T12:32:25.548Z");

QuoteTicket.findByPk = mock(async () => ({
  countryCode: "BR",
  inputAmount: "25003",
  inputCurrency: FiatToken.BRL,
  metadata: {
    fees: {
      displayFiat: {
        anchor: "0.75",
        currency: "BRL",
        network: "0",
        partnerMarkup: "0",
        total: "0.75",
        vortex: "0"
      },
      usd: {
        anchor: "0.15",
        network: "0",
        partnerMarkup: "0",
        total: "0.15",
        vortex: "0"
      }
    }
  },
  network: Networks.Base,
  outputAmount: "25002.25",
  outputCurrency: "BRLA"
})) as unknown as typeof QuoteTicket.findByPk;

class TestRampService extends RampService {
  public constructor(private readonly rampState: RampState) {
    super();
  }

  protected async getRampState(): Promise<RampState | null> {
    return this.rampState;
  }
}

function makeRampState(onHold: boolean, currentPhase: RampPhase = "brlaOnrampMint") {
  return RampState.build({
    createdAt,
    currentPhase,
    errorLogs: [],
    flowVariant: config.flowVariant,
    from: EPaymentMethod.PIX,
    id: "ramp-1",
    paymentMethod: EPaymentMethod.PIX,
    phaseHistory: [{ phase: currentPhase, timestamp: createdAt }],
    postCompleteState: {
      cleanup: {
        cleanupAt: null,
        cleanupCompleted: false,
        errors: null
      }
    },
    presignedTxs: null,
    processingLock: {
      locked: false,
      lockedAt: null
    },
    quoteId: "quote-1",
    state: makeStateMetadata({ onHold }),
    to: Networks.Base,
    type: RampDirection.BUY,
    unsignedTxs: [],
    userId: null,
    updatedAt
  });
}

function makeStateMetadata(overrides: Partial<StateMetadata>): StateMetadata {
  return {
    assethubToPendulumHash: "",
    aveniaTicketId: "ticket-1",
    brlaEvmAddress: "",
    depositQrCode: undefined,
    destinationAddress: "0x2222222222222222222222222222222222222222",
    distributeFeeHash: "",
    evmEphemeralAddress: "",
    finalUserAddress: "",
    ibanPaymentData: {
      bic: "",
      iban: "",
      receiverName: ""
    },
    moonbeamEphemeralAccount: {
      address: "",
      secret: ""
    },
    moonbeamXcmTransactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    nabla: {
      approveExtrinsicOptions: makeExtrinsicOptions(),
      swapExtrinsicOptions: makeExtrinsicOptions()
    },
    nablaSoftMinimumOutputRaw: "",
    payOutTicketId: undefined,
    pixDestination: "",
    presignChecksPass: true,
    receiverTaxId: "",
    sessionId: "session-1",
    squidRouterApproveHash: "",
    squidRouterPayTxHash: "",
    squidRouterQuoteId: "",
    squidRouterReceiverHash: "",
    squidRouterReceiverId: "",
    squidRouterSwapHash: "",
    substrateEphemeralAddress: "",
    taxId: "",
    unhandledPaymentAlertSent: false,
    walletAddress: undefined,
    ...overrides
  };
}

function makeExtrinsicOptions() {
  return {
    callerAddress: "",
    contractDeploymentAddress: "",
    limits: {
      gas: {
        proofSize: 0,
        refTime: 0
      }
    },
    messageArguments: [],
    messageName: ""
  };
}

describe("RampService.getRampStatus", () => {
  it("returns onHoldForComplianceCheck when ramp state is marked as on hold", async () => {
    const service = new TestRampService(makeRampState(true));

    const status = await service.getRampStatus("ramp-1");

    expect(status?.currentPhase).toBe("onHoldForComplianceCheck");
  });

  it("returns the persisted current phase when ramp state is not on hold", async () => {
    const service = new TestRampService(makeRampState(false));

    const status = await service.getRampStatus("ramp-1");

    expect(status?.currentPhase).toBe("brlaOnrampMint");
  });

  it("does not mask later phases if a stale on-hold flag remains", async () => {
    const service = new TestRampService(makeRampState(true, "fundEphemeral"));

    const status = await service.getRampStatus("ramp-1");

    expect(status?.currentPhase).toBe("fundEphemeral");
  });
});
