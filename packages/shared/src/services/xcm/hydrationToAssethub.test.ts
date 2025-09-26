import {test} from "bun:test";
import {dryRunExtrinsic,} from "@packages/shared";
import {createHydrationToAssethubTransfer} from "./hydrationToAssethub";

test("dry-run hydration to assethub with swap on hydration", async () => {
  // Hardcoded values for testing purposes
  const receiverAddress = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg"; // Example address
  const rawAmount = "1000000";

  const network = "hydration";

  // 1. Create the extrinsic
  const {extrinsic} = await createHydrationToAssethubTransfer(
    receiverAddress,
    rawAmount,
    '22' // USDC
  );

  // 2. Dry-run the extrinsic
  const dryRunResult = await dryRunExtrinsic(extrinsic, network, receiverAddress);

  // 3. Log the result
  console.log("Dry-run result:", JSON.stringify(dryRunResult.toHuman(), null, 2));
}, 30000); // Set a timeout of 30 seconds for the test
