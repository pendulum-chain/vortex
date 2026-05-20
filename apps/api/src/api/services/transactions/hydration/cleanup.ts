import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { ApiManager, getAddressForFormat } from "@vortexfi/shared";
import { getFundingAccount } from "../../../controllers/subsidize.controller";

export async function prepareHydrationCleanupTransaction(
  inputAssetId: string | number,
  outputAssetId: string | number
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const { api, ss58Format } = await apiManager.getApi("hydration");

  const fundingAccountKeypair = getFundingAccount();
  const fundingAddress = getAddressForFormat(fundingAccountKeypair.address, ss58Format);

  return api.tx.utility.batchAll([
    api.tx.tokens.transferAll(fundingAddress, inputAssetId, false),
    api.tx.tokens.transferAll(fundingAddress, outputAssetId, false),
    api.tx.balances.transferAll(fundingAddress, false)
  ]);
}
