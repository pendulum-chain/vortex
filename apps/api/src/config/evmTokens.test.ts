import { describe, expect, mock, test } from "bun:test";
import { loadEvmTokens } from "./evmTokens";

const INTERVAL_MS = 5;

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline) await Bun.sleep(1);
};

describe("loadEvmTokens", () => {
  test("does not retry when the first load succeeds", async () => {
    const load = mock(async () => true);

    await loadEvmTokens(load, INTERVAL_MS);
    await Bun.sleep(INTERVAL_MS * 6);

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("resolves after the first attempt, retries until the load succeeds, then stops", async () => {
    const results = [false, false, true];
    const load = mock(async () => results.shift() ?? true);

    await loadEvmTokens(load, INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(1);

    await waitFor(() => load.mock.calls.length >= 3);
    await Bun.sleep(INTERVAL_MS * 6);

    expect(load).toHaveBeenCalledTimes(3);
  });
});
