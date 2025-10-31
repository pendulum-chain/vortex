import {test} from "bun:test";
import {createMoonbeamToAssethubTransferWithSwapOnHydration, dryRunExtrinsic,} from "../../index"

test("dry-run moonbeam to assethub with swap on hydration", async () => {
  // Hardcoded values for testing purposes
  const receiverAddress = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"; // Example address
  const rawAmount = "1000000";
  const assetAccountKey = "0xFFfffffF7D2B0B761Af01Ca8e25242976ac0aD7D"; // xcUSDC
  const accountId = "0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877"; // Example account ID for dry-run origin

  const network = "moonbeam";

  // 1. Create the extrinsic
  const extrinsic = await createMoonbeamToAssethubTransferWithSwapOnHydration(
    receiverAddress,
    rawAmount,
    assetAccountKey
  );

  // 2. Dry-run the extrinsic
  const dryRunResult = await dryRunExtrinsic(extrinsic, network, accountId);

  // 3. Log the result
  console.log("Dry-run result:", JSON.stringify(dryRunResult.toHuman(), null, 2));
}, 30000); // Set a timeout of 30 seconds for the test
