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

  // The dryRunApi is a runtime call, so we use api.call.
  // biome-ignore lint/suspicious/noExplicitAny: It might not be available on all chains, hence the `any` cast.
  const dryRunResult = await (api.call as any).dryRunApi.dryRunCall(origin, extrinsic.toHex(), resultXcmVersions);

  return dryRunResult;
}
