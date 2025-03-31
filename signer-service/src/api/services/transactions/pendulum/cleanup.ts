import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { PendulumCurrencyId } from "shared";
import { ApiManager } from "../../pendulum/apiManager";





export async function preparePendulumCleanupTransaction(fundingAccountAddress: string, inputCurrencyId: PendulumCurrencyId, outputCurrencyId: PendulumCurrencyId): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {

    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    return pendulumNode.api.tx.utility
        .batchAll([
            pendulumNode.api.tx.tokens.transferAll(fundingAccountAddress, inputCurrencyId, false),
            pendulumNode.api.tx.tokens.transferAll(fundingAccountAddress, outputCurrencyId, false),
            pendulumNode.api.tx.balances.transferAll(fundingAccountAddress, false),
        ])

}
