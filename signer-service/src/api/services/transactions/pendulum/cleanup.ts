import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { PendulumCurrencyId } from "shared";
import { ApiManager } from "../../pendulum/apiManager";
import { getFundingData } from "../../pendulum/pendulum.service";
import { getFundingAccount } from "../../../controllers/subsidize.controller";


export async function preparePendulumCleanupTransaction(inputCurrencyId: PendulumCurrencyId, outputCurrencyId: PendulumCurrencyId): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {

    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const fundingAccountKeypair = getFundingAccount();
    const fundingAccountAddress = fundingAccountKeypair.address;

    return pendulumNode.api.tx.utility
        .batchAll([
            pendulumNode.api.tx.tokens.transferAll(fundingAccountAddress, inputCurrencyId, false),
            pendulumNode.api.tx.tokens.transferAll(fundingAccountAddress, outputCurrencyId, false),
            pendulumNode.api.tx.balances.transferAll(fundingAccountAddress, false),
        ])

}
