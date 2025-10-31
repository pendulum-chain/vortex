import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { ApiManager } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";

export async function prepareMoonbeamCleanupTransaction(): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  const moonbeamNode = await apiManager.getApi(networkName);

  const moonbeamAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);

  return moonbeamNode.api.tx.balances.transferAll(moonbeamAccount.address, false);
}
