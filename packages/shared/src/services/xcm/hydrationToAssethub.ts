import { Builder } from "@paraspell/sdk-pjs";
import { Extrinsic } from "@polkadot/types/interfaces";
import { XcmFees } from "./types";

export async function createHydrationToAssethubTransfer(
  receiverAddress: string,
  rawAmount: string,
  assetId: string
): Promise<{ fees: XcmFees; extrinsic: Extrinsic }> {
  const transaction = Builder().from("Hydration").to("AssetHubPolkadot").address(receiverAddress).currency({
    amount: rawAmount,
    id: assetId
  });

  const info = await transaction.senderAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY").getXcmFeeEstimate();
  console.log("info :", info);

  const fees = {
    destination: {
      amountRaw: info.destination.fee.toString(),
      currency: info.destination.currency
    },
    origin: {
      amountRaw: info.origin.fee.toString(),
      currency: info.origin.currency
    }
  };

  return { extrinsic: await transaction.build(), fees };
}
