import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { runSerializedEvmFundingOperation } from "./evm-funding";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runSerializedEvmFundingOperation", () => {
  it("runs funding operations on the same network in FIFO order", async () => {
    const firstGate = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const events: string[] = [];

    const first = runSerializedEvmFundingOperation(Networks.Base, async () => {
      events.push("first-start");
      firstStarted.resolve();
      await firstGate.promise;
      events.push("first-end");
    });
    await firstStarted.promise;

    const second = runSerializedEvmFundingOperation(Networks.Base, async () => {
      events.push("second-start");
      secondStarted.resolve();
    });
    const startOutcome = await Promise.race([
      secondStarted.promise.then(() => "started"),
      new Promise<"waiting">(resolve => setTimeout(() => resolve("waiting"), 10))
    ]);

    firstGate.resolve();
    await Promise.all([first, second]);

    expect(startOutcome).toBe("waiting");
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("does not serialize funding operations on different networks", async () => {
    const baseGate = deferred();
    const baseStarted = deferred();
    const polygonStarted = deferred();

    const baseOperation = runSerializedEvmFundingOperation(Networks.Base, async () => {
      baseStarted.resolve();
      await baseGate.promise;
    });
    await baseStarted.promise;

    const polygonOperation = runSerializedEvmFundingOperation(Networks.Polygon, async () => {
      polygonStarted.resolve();
    });
    await polygonStarted.promise;

    baseGate.resolve();
    await Promise.all([baseOperation, polygonOperation]);
  });

  it("releases the queue after a funding operation rejects", async () => {
    await expect(
      runSerializedEvmFundingOperation(Networks.Base, async () => {
        throw new Error("send failed");
      })
    ).rejects.toThrow("send failed");

    await expect(runSerializedEvmFundingOperation(Networks.Base, async () => "recovered")).resolves.toBe("recovered");
  });
});
