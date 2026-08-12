import { afterEach, describe, expect, it, mock } from "bun:test";
import { AveniaTicketStatus } from "@vortexfi/shared";
import ProviderCustomer from "../../models/providerCustomer.model";
import RampState from "../../models/rampState.model";
import UnhandledPaymentWorker from "./unhandled-payment.worker";

const originalProviderFindOne = ProviderCustomer.findOne;
const originalRampStateFindAll = RampState.findAll;

afterEach(() => {
  ProviderCustomer.findOne = originalProviderFindOne;
  RampState.findAll = originalRampStateFindAll;
});

function paidInitialState(unhandledPaymentAlertSent = false) {
  return {
    currentPhase: "initial",
    id: "ramp-1",
    state: {
      aveniaTicketId: "ticket-1",
      subAccountId: "snapshotted-subaccount",
      taxId: "08786985906",
      unhandledPaymentAlertSent
    },
    update: mock(async () => undefined)
  };
}

function workerWithTickets(
  recoverPaidAveniaRamp: (rampId: string) => Promise<unknown>,
  getAveniaPayinTickets = mock(async () => [{ id: "ticket-1", status: AveniaTicketStatus.PAID }])
) {
  const worker = new UnhandledPaymentWorker("*/15 * * * *", {
    brlaApiService: { getAveniaPayinTickets } as never,
    recoverPaidAveniaRamp,
    runOnInit: false,
    slackNotifier: { sendMessage: mock(async () => undefined) }
  }) as any;
  return worker;
}

describe("UnhandledPaymentWorker paid initial recovery", () => {
  it("keeps a pending ticket eligible until a later cycle reports it paid", async () => {
    const getTickets = mock()
      .mockResolvedValueOnce([{ id: "ticket-1", status: AveniaTicketStatus.PENDING }])
      .mockResolvedValueOnce([{ id: "ticket-1", status: AveniaTicketStatus.PAID }]);
    const recover = mock(async () => ({} as never));
    const state = paidInitialState();
    const worker = workerWithTickets(recover, getTickets);
    RampState.findAll = mock(async options => {
      if (options?.where?.currentPhase !== "initial" || worker.processedStateIds.has(state.id)) {
        return [];
      }
      return [state];
    }) as never;

    await worker.checkUnhandledPayments();
    await worker.checkUnhandledPayments();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith("ramp-1");
  });

  it("starts a provider-confirmed paid initial ramp instead of only alerting", async () => {
    ProviderCustomer.findOne = mock(async () => ({ providerSubaccountId: "subaccount-1" })) as never;
    const recover = mock(async () => ({} as never));
    const state = paidInitialState();
    const worker = workerWithTickets(recover);

    await worker.processStatesForUnhandledPayments([state]);

    expect(worker.brlaApiService.getAveniaPayinTickets).toHaveBeenCalledWith("snapshotted-subaccount");
    expect(ProviderCustomer.findOne).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledWith("ramp-1");
    expect(state.update).not.toHaveBeenCalled();
    expect(worker.slackNotifier.sendMessage).not.toHaveBeenCalled();
  });

  it("recovers a paid initial ramp despite a historical alert flag", async () => {
    const recover = mock(async () => ({} as never));
    const state = paidInitialState(true);
    const worker = workerWithTickets(recover);

    await worker.processStatesForUnhandledPayments([state]);

    expect(recover).toHaveBeenCalledWith("ramp-1");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("does not check a successfully recovered initial ramp again", async () => {
    const recover = mock(async () => ({} as never));
    const state = paidInitialState();
    const worker = workerWithTickets(recover);
    RampState.findAll = mock(async options => {
      if (options?.where?.currentPhase !== "initial" || worker.processedStateIds.has(state.id)) {
        return [];
      }
      return [state];
    }) as never;

    await worker.checkUnhandledPayments();
    await worker.checkUnhandledPayments();

    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("alerts but keeps a failed automatic recovery eligible for the next cycle", async () => {
    ProviderCustomer.findOne = mock(async () => ({ providerSubaccountId: "subaccount-1" })) as never;
    const recover = mock(async () => {
      throw new Error("database temporarily unavailable");
    });
    const state = paidInitialState();
    const worker = workerWithTickets(recover);

    await worker.processStatesForUnhandledPayments([state]);
    await worker.processStatesForUnhandledPayments([state]);

    expect(recover).toHaveBeenCalledTimes(2);
    expect(state.update).not.toHaveBeenCalled();
    expect(worker.slackNotifier.sendMessage).toHaveBeenCalledTimes(1);
  });
});
