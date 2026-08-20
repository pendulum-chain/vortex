import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { APIError } from "../../errors/api-error";
import { RampService } from "./ramp.service";

const originalRampFindByPk = RampState.findByPk;
const originalQuoteFindByPk = QuoteTicket.findByPk;

class TestRampService extends RampService {
  protected async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    return callback({} as Transaction);
  }
}

const identities = {
  rampA: { aveniaTicketId: "ticket-a", subAccountId: "subaccount-a", taxId: "11144477735" },
  rampB: { aveniaTicketId: "ticket-b", subAccountId: "subaccount-b", taxId: "52998224725" }
};

function makeRamp() {
  const state = {
    ...identities.rampA,
    blockState: { aveniaMint: { ...identities.rampA } },
    destinationAddress: "0x1111111111111111111111111111111111111111",
    evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
    squidRouterApproveHash: "0xexisting",
    substrateEphemeralAddress: ""
  };
  return {
    createdAt: new Date(),
    currentPhase: "initial",
    flowVariant: config.flowVariant,
    from: EPaymentMethod.PIX,
    id: "ramp-a",
    paymentMethod: EPaymentMethod.PIX,
    presignedTxs: [],
    quoteId: "quote-a",
    state,
    to: Networks.Base,
    type: RampDirection.BUY,
    unsignedTxs: [],
    update: mock(async (values: { state?: typeof state }) => {
      if (values.state) ramp.state = values.state;
    }),
    updatedAt: new Date(),
    userId: "user-a"
  };
}

const quote = {
  id: "quote-a",
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  metadata: {
    blocks: {},
    flow: { id: "BrlOnrampBaseDirect" },
    globals: { fees: { usd: {} }, request: {} }
  },
  outputAmount: "19",
  outputCurrency: "USDC",
  rampType: RampDirection.BUY
};

let ramp = makeRamp();

beforeEach(() => {
  ramp = makeRamp();
  RampState.findByPk = mock(async () => ramp) as never;
  QuoteTicket.findByPk = mock(async () => quote) as never;
});

afterAll(() => {
  RampState.findByPk = originalRampFindByPk;
  QuoteTicket.findByPk = originalQuoteFindByPk;
});

describe("RampService.updateRamp additionalData", () => {
  for (const [field, value] of Object.entries({
    aveniaTicketId: identities.rampB.aveniaTicketId,
    blockState: { aveniaMint: { ...identities.rampB } },
    subAccountId: identities.rampB.subAccountId,
    taxId: identities.rampB.taxId
  })) {
    it(`rejects client replacement of server-owned ${field}`, async () => {
      const service = new TestRampService();

      await expect(
        service.updateRamp({ additionalData: { [field]: value }, presignedTxs: [], rampId: ramp.id })
      ).rejects.toMatchObject({ status: httpStatus.BAD_REQUEST } satisfies Partial<APIError>);

      expect(ramp.update).not.toHaveBeenCalled();
      expect(ramp.state).toMatchObject({ ...identities.rampA, blockState: { aveniaMint: identities.rampA } });
    });
  }

  for (const field of [
    "assethubToPendulumHash",
    "squidRouterApproveHash",
    "squidRouterNoPermitApproveHash",
    "squidRouterNoPermitSwapHash",
    "squidRouterNoPermitTransferHash",
    "squidRouterSwapHash"
  ] as const) {
    it(`preserves partial updates of supported client-reported ${field}`, async () => {
      const service = new TestRampService();
      Object.assign(service, {
        ephemeralPresignChecksPass: mock(async () => false),
        startPersistedFlow: mock(async () => ({})),
        tryReleaseDepositQr: mock(async () => false)
      });

      await service.updateRamp({
        additionalData: { [field]: "0xnew" },
        presignedTxs: [],
        rampId: ramp.id
      });

      expect(ramp.state).toMatchObject({
        ...identities.rampA,
        [field]: "0xnew",
        blockState: { aveniaMint: identities.rampA }
      });
    });
  }
});
