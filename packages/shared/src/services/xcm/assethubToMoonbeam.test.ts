import {expect, test} from "bun:test";
import {dryRunExtrinsic,} from "../../index";
import {createAssethubToMoonbeamTransferWithSwapOnHydration} from "./assethubToMoonbeam";

// Hits live AssetHub/Hydration RPCs; opt-in only (see docs/testing-strategy.md).
test.skipIf(!process.env.RUN_LIVE_TESTS)("dry-run assethub to moonbeam with swap on hydration", async () => {
  // Hardcoded values for testing purposes. The transferred asset is USDT on AssetHub
  // (hardcoded in the production function).
  const rawAmount = "1000000";
  const receiverAddress = "0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877"; // Example account ID for dry-run origin
  const accountKey = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg"; // Example address

  // 1. Create the extrinsic
  const extrinsic = await createAssethubToMoonbeamTransferWithSwapOnHydration(receiverAddress, rawAmount);

  // 2. Dry-run the extrinsic
  const network = "assethub";
  const dryRunResult = await dryRunExtrinsic(extrinsic, network, accountKey);
  console.log("Dry-run result:", JSON.stringify(dryRunResult.toHuman(), null, 2));

  // 3. The dry run must report successful local execution — a Result payload that
  // carries an XCM error (e.g. Filtered/FailedToTransactAsset) is a failure.
  expect(dryRunResult.isOk).toBe(true);
  // biome-ignore lint/suspicious/noExplicitAny: runtime-call codec typing is too loose here
  const effects = dryRunResult.asOk as any;
  expect(effects.executionResult.isOk).toBe(true);
}, 30000); // Set a timeout of 30 seconds for the test
