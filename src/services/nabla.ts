import { SwapOptions } from "../components/InputKeys";
import { EventStatus } from "../components/GenericEvent";
import { getApiManagerInstance } from "./polkadot/polkadotApi";
import { Abi } from '@polkadot/api-contract';
import { erc20WrapperAbi } from '../contracts/ERC20Wrapper'
import {routerAbi} from '../contracts/Router'
import { NABLA_ROUTER} from '../constants/constants';
import { defaultReadLimits } from "../helpers/contracts";
import { readMessage, ReadMessageResult , executeMessage, ExecuteMessageResult} from '@pendulum-chain/api-solang';
import { parseContractBalanceResponse } from "../helpers/contracts";
import { TOKEN_CONFIG } from "../constants/tokenConfig";
import { WalletAccount } from "@talismn/connect-wallets";
import { defaultWriteLimits, createWriteOptions } from '../helpers/contracts';
import { stringDecimalToBN } from '../helpers/parseNumbers';
import { toBigNumber } from "../helpers/parseNumbers";

export interface PerformSwapProps {
    swap: SwapOptions;
    userAddress: string;
    walletAccount: WalletAccount
}

export async function performSwap({swap, userAddress, walletAccount}: PerformSwapProps, renderEvent: (event: string, status: EventStatus) => void): Promise<number>{
    // event attempting swap 
    renderEvent('Attempting swap', EventStatus.Waiting);
    // get chain api, abi
    const pendulumApiComponents = (await getApiManagerInstance()).apiData!;
    const erc20ContractAbi = new Abi(erc20WrapperAbi, pendulumApiComponents.api.registry.getChainProperties());
    const routerAbiObject = new Abi(routerAbi, pendulumApiComponents.api.registry.getChainProperties());
    // get asset details
    const assetInDetails = TOKEN_CONFIG[swap.assetIn];
    const assetOutDetails = TOKEN_CONFIG[swap.assetOut];

    // call the current allowance of the user
    const response: ReadMessageResult = await readMessage({
            abi: erc20ContractAbi,
            api: pendulumApiComponents.api,
            contractDeploymentAddress: assetInDetails.erc20Address!,
            callerAddress: walletAccount.address,
            messageName: 'allowance',
            messageArguments: [walletAccount.address, NABLA_ROUTER],
            limits: defaultReadLimits,
        });
        
    if (response.type !== 'success') {
        const message = 'Could not load token allowance';
        renderEvent(message, EventStatus.Error);
        return Promise.reject(message);
    }

    const currentAllowance = parseContractBalanceResponse(assetInDetails.decimals, response.value);
    const amountToSwapBig = stringDecimalToBN(swap.amountIn.toString(), assetInDetails.decimals);
    const amountMinBig = stringDecimalToBN(swap.minAmountOut?.toString() ?? '0', assetInDetails.decimals)
    //maybe do allowance
    if (
        currentAllowance !== undefined &&
        currentAllowance.rawBalance.lt(amountToSwapBig)
    ) {

        try{
            renderEvent(`Please sign approval swap: ${toBigNumber(amountToSwapBig, assetInDetails.decimals)} ${assetInDetails.assetCode.toUpperCase()}`, EventStatus.Waiting);
            await approve({api: pendulumApiComponents.api, amount: amountToSwapBig.toString() , token: assetInDetails.erc20Address!, spender: NABLA_ROUTER, contractAbi: erc20ContractAbi, walletAccount}); 

        }catch(e){
            renderEvent(`Could not approve token: ${e}`, EventStatus.Error);
            return Promise.reject('Could not approve token');
        }
    }
    // balance before the swap
    const responseBalanceBefore = (
        await pendulumApiComponents.api.query.tokens.accounts(userAddress, assetOutDetails.currencyId)
    ).toHuman() as any;

    const rawBalanceBefore = responseBalanceBefore?.free || '0';
    const balanceBeforeBigDecimal = toBigNumber(rawBalanceBefore, assetOutDetails.decimals)

    // Try swap
    try{
        renderEvent(`Please sign transaction to swap ${swap.amountIn} ${assetInDetails.assetCode.toUpperCase()} to ${swap.initialDesired} ${assetOutDetails.assetCode.toUpperCase()} `, EventStatus.Waiting);
        await doActualSwap({api: pendulumApiComponents.api, amount: amountToSwapBig.toString(), amountMin: amountMinBig.toString() ,tokenIn: assetInDetails.erc20Address!, tokenOut: assetOutDetails.erc20Address!, contractAbi: routerAbiObject, walletAccount});  
    }catch(e){
        let errorMessage='';
        const result = (e as ExecuteMessageResult).result
        if (result.type === 'reverted') {errorMessage = result.description}
        else if (result.type === 'error') {errorMessage = result.error}
        else {errorMessage = 'Something went wrong'}
        renderEvent(`Could not swap token: ${errorMessage}`, EventStatus.Error);
        return Promise.reject('Could not swap token');
    }

    //verify token balance before releasing this process.
    const responseBalanceAfter = (
        await pendulumApiComponents.api.query.tokens.accounts(userAddress, assetOutDetails.currencyId)
    ).toHuman() as any;


    const rawBalanceAfter = responseBalanceAfter?.free || '0';
    const balanceAfterBigDecimal = toBigNumber(rawBalanceAfter, assetOutDetails.decimals)

    const actualOfframpValue = balanceAfterBigDecimal.sub(balanceBeforeBigDecimal)
    
    renderEvent(`Swap successful. Amount to offramp : ${actualOfframpValue}`, EventStatus.Success);

    return actualOfframpValue.toNumber();
}


async function approve({api, token, spender, amount,  contractAbi, walletAccount}: any){
    console.log('write', `call approve ${token} for ${spender} with amount ${amount} `);
    const response = await executeMessage({
        abi: contractAbi,
        api,
        callerAddress: walletAccount.address,
        contractDeploymentAddress: token,
        getSigner: () =>
        Promise.resolve({
            type: 'signer',
            address: walletAccount.address,
            signer: walletAccount.signer,
        }),
        messageName: 'approve',
        messageArguments: [spender, amount],
        limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
        gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
    });

    console.log('write', 'call approve response', walletAccount.address, [spender, amount], response);

    if (response?.result?.type !== 'success') throw response;
    return response;
}

async function doActualSwap({api, tokenIn, tokenOut, amount, amountMin,  contractAbi, walletAccount}: any){
    console.log('write', `call swap ${tokenIn} for ${tokenOut} with amount ${amount}, minimum expexted ${amountMin} `);
    const response = await executeMessage({
        abi: contractAbi,
        api,
        callerAddress: walletAccount.address,
        contractDeploymentAddress: NABLA_ROUTER,
        getSigner: () =>
        Promise.resolve({
            type: 'signer',
            address: walletAccount.address,
            signer: walletAccount.signer,
        }),
        messageName: 'swapExactTokensForTokens',
        // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
        messageArguments: [amount, amountMin, [tokenIn, tokenOut], walletAccount.address, calcDeadline(5)],
        limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
        gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
    });

    if (response?.result?.type !== 'success') throw response;
    return response;

}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;