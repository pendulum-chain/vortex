import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { ApiManager, Networks } from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../phases/evm-funding";

export async function prepareMoonbeamCleanupTransaction(): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  const moonbeamNode = await apiManager.getApi(networkName);

  const moonbeamAccount = getEvmFundingAccount(Networks.Moonbeam);

  return moonbeamNode.api.tx.balances.transferAll(moonbeamAccount.address, false);
}
