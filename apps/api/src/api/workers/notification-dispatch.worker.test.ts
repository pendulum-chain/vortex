import { describe, expect, it } from "bun:test";
import NotificationDispatchWorker from "./notification-dispatch.worker";

type TestableWorker = {
  dispatchJob: { isActive: boolean; waitForCompletion: boolean };
  reconcileJob: { isActive: boolean; waitForCompletion: boolean };
};

describe("NotificationDispatchWorker scheduling", () => {
  it("does not run on construction and suppresses overlapping cycles", () => {
    const { dispatchJob, reconcileJob } = new NotificationDispatchWorker() as unknown as TestableWorker;

    expect(dispatchJob.isActive).toBe(false);
    expect(dispatchJob.waitForCompletion).toBe(true);
    expect(reconcileJob.isActive).toBe(false);
    expect(reconcileJob.waitForCompletion).toBe(true);
  });
});
