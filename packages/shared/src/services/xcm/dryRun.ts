import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { Extrinsic } from "@polkadot/types/interfaces";
import { ISubmittableResult } from "@polkadot/types/types";
import { ApiManager, SubstrateApiNetwork } from "../pendulum/apiManager";

/**
 * Dry-runs an extrinsic on a specified network.
 *
 * @param extrinsic The extrinsic to dry-run.
 * @param network The network to perform the dry-run on.
 * @param accountId The account ID to use as the origin for the dry-run.
 * @returns The result of the dry-run call.
 */
export async function dryRunExtrinsic(extrinsic: Extrinsic, network: SubstrateApiNetwork, accountId: string) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi(network);

  const origin = { System: { Signed: accountId } };
  const resultXcmVersions = 4;

  // Remove the first 6 characters after the "0x" prefix which represent the length of the extrinsic.
  // This is required because the dryRunCall expects the extrinsic without the length prefix.
  const extrinsicHexWithoutLength = "0x" + extrinsic.toHex().slice(8);

  console.log("Extrinsic Hex Without Length:", extrinsicHexWithoutLength);
  console.log("Extrinsic hex:", extrinsic.toHex());

  // The dryRunApi is a runtime call, so we use api.call.
  const dryRunResult =
    network === "moonbeam"
      ? await api.call.dryRunApi.dryRunCall(origin, extrinsicHexWithoutLength, resultXcmVersions)
      : await api.call.dryRunApi.dryRunCall(origin, extrinsicHexWithoutLength);

  return dryRunResult;
}
