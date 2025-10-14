import { multiplyByPowerOfTen } from "@packages/shared";
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

  const destinationAmountRaw = info.destination.fee.toString();
  // The destination fee is always in AssetHub DOT which has 10 decimals
  const destinationAmountDecimals = multiplyByPowerOfTen(destinationAmountRaw, -10).toString();

  const originAmountRaw = info.origin.fee.toString();
  // The origin fee is always in HDX which has 12 decimals
  const originAmountDecimals = multiplyByPowerOfTen(originAmountRaw, -12).toString();

  const fees = {
    destination: {
      amount: destinationAmountDecimals,
      amountRaw: destinationAmountRaw,
      currency: info.destination.currency
    },
    origin: {
      amount: originAmountDecimals,
      amountRaw: originAmountRaw,
      currency: info.origin.currency
    }
  };

  return { extrinsic: await transaction.build(), fees };
}
