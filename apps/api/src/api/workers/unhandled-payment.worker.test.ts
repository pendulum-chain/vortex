import { afterEach, describe, expect, it, mock } from "bun:test";
import { AveniaTicketStatus } from "@vortexfi/shared";
import ProviderCustomer from "../../models/providerCustomer.model";
import UnhandledPaymentWorker from "./unhandled-payment.worker";

const originalProviderFindOne = ProviderCustomer.findOne;

afterEach(() => {
  ProviderCustomer.findOne = originalProviderFindOne;
});

function paidInitialState() {
  return {
    currentPhase: "initial",
    id: "ramp-1",
    state: {
      aveniaTicketId: "ticket-1",
      subAccountId: "snapshotted-subaccount",
      taxId: "08786985906"
    },
    update: mock(async () => undefined)
  };
}

function workerWithPaidTicket(recoverPaidAveniaRamp: (rampId: string) => Promise<unknown>) {
  const getAveniaPayinTickets = mock(async () => [{ id: "ticket-1", status: AveniaTicketStatus.PAID }]);
  const worker = new UnhandledPaymentWorker("*/15 * * * *", {
    brlaApiService: { getAveniaPayinTickets } as never,
    recoverPaidAveniaRamp,
    runOnInit: false,
    slackNotifier: { sendMessage: mock(async () => undefined) }
  }) as any;
  return worker;
}

describe("UnhandledPaymentWorker paid initial recovery", () => {
  it("starts a provider-confirmed paid initial ramp instead of only alerting", async () => {
    ProviderCustomer.findOne = mock(async () => ({ providerSubaccountId: "subaccount-1" })) as never;
    const recover = mock(async () => ({} as never));
    const state = paidInitialState();
    const worker = workerWithPaidTicket(recover);

    await worker.processStatesForUnhandledPayments([state]);

    expect(worker.brlaApiService.getAveniaPayinTickets).toHaveBeenCalledWith("snapshotted-subaccount");
    expect(ProviderCustomer.findOne).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledWith("ramp-1");
    expect(state.update).not.toHaveBeenCalled();
    expect(worker.slackNotifier.sendMessage).not.toHaveBeenCalled();
  });

  it("alerts but keeps a failed automatic recovery eligible for the next cycle", async () => {
    ProviderCustomer.findOne = mock(async () => ({ providerSubaccountId: "subaccount-1" })) as never;
    const recover = mock(async () => {
      throw new Error("database temporarily unavailable");
    });
    const state = paidInitialState();
    const worker = workerWithPaidTicket(recover);

    await worker.processStatesForUnhandledPayments([state]);
    await worker.processStatesForUnhandledPayments([state]);

    expect(recover).toHaveBeenCalledTimes(2);
    expect(state.update).not.toHaveBeenCalled();
    expect(worker.slackNotifier.sendMessage).toHaveBeenCalledTimes(1);
  });
});
