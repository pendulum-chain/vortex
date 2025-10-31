import {test} from "bun:test";
import {dryRunExtrinsic,} from "@vortexfi/shared";
import {createAssethubToMoonbeamTransferWithSwapOnHydration} from "./assethubToMoonbeam";

test("dry-run assethub to moonbeam with swap on hydration", async () => {
  // Hardcoded values for testing purposes
  const rawAmount = "1000000";
  const assetAccountKey = "0xFFfffffF7D2B0B761Af01Ca8e25242976ac0aD7D"; // xcUSDC
  const receiverAddress = "0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877"; // Example account ID for dry-run origin
  const accountKey = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg"; // Example address

  // 1. Create the extrinsic
  const extrinsic = await createAssethubToMoonbeamTransferWithSwapOnHydration(
    receiverAddress,
    rawAmount,
    assetAccountKey
  );

  // 2. Dry-run the extrinsic
  const network = "assethub";
  const dryRunResult = await dryRunExtrinsic(extrinsic, network, accountKey);

  // 3. Log the result
  console.log("Dry-run result:", JSON.stringify(dryRunResult.toHuman(), null, 2));
}, 30000); // Set a timeout of 30 seconds for the test
