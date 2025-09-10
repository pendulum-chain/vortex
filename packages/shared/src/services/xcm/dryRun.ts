import { SubmittableExtrinsic } from "@polkadot/api-base/types";
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
export async function dryRunExtrinsic(
  extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>,
  network: SubstrateApiNetwork,
  accountId: string
) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi(network);

  const origin = { system: { Signed: accountId } };
  const resultXcmVersions = 4;

  console.log("hex extrinsic", extrinsic.toHex());
  console.log("hex extrinsic (bare)", extrinsic.toHex(true));

  // Remove the first 6 characters after the "0x" prefix which represent the length of the extrinsic.
  // This is required because the dryRunCall expects the extrinsic without the length prefix for Moonbeam.
  const extrinsicHexWithoutLength = "0x" + extrinsic.toHex().slice(8);
  console.log("hex extrinsic without length", extrinsicHexWithoutLength);

  console.log("origin", origin);

  // The dryRunApi is a runtime call, so we use api.call.
  // biome-ignore lint/suspicious/noExplicitAny: It might not be available on all chains, hence the `any` cast.
  const dryRunResult = await api.call.dryRunApi.dryRunCall(origin, extrinsicHexWithoutLength, resultXcmVersions);

  return dryRunResult;
}
