import Big from 'big.js';
import { createExecuteMessageExtrinsic, Extrinsic, readMessage, ReadMessageResult } from '@pendulum-chain/api-solang';
import { API } from '../../pendulum/apiManager';
import { Abi } from '@polkadot/api-contract';
import { ApiPromise } from '@polkadot/api';

import { erc20WrapperAbi } from '../../../../contracts/ERC20Wrapper';
import { NABLA_ROUTER, PendulumDetails } from '../../../../config/tokens';
import {
  createWriteOptions,
  defaultReadLimits,
  defaultWriteLimits,
  parseContractBalanceResponse,
} from '../../../helpers/contracts';

export interface PrepareNablaApproveParams {
  inputTokenDetails: PendulumDetails;
  amountRaw: string;
  pendulumEphemeralAddress: string;
  pendulumNode: API;
}

interface CreateApproveExtrinsicOptions {
  api: ApiPromise;
  token: string;
  spender: string;
  amount: string;
  contractAbi: Abi;
  callerAddress: string;
}

async function createApproveExtrinsic({
  api,
  token,
  spender,
  amount,
  contractAbi,
  callerAddress,
}: CreateApproveExtrinsicOptions) {
  console.log('write', `call approve ${token} for ${spender} with amount ${amount} `);

  const { execution, result: readMessageResult } = await createExecuteMessageExtrinsic({
    abi: contractAbi,
    api,
    callerAddress,
    contractDeploymentAddress: token,
    messageName: 'approve',
    messageArguments: [spender, amount],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  });

  if (execution.type === 'onlyRpc') {
    throw Error("Couldn't create approve extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;

  return extrinsic;
}

export async function prepareNablaApproveTransaction({
  inputTokenDetails,
  amountRaw,
  pendulumEphemeralAddress,
  pendulumNode,
}: PrepareNablaApproveParams): Promise<Extrinsic> {
  const { api } = pendulumNode;

  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());

  // call the current allowance of the ephemeral
  const response: ReadMessageResult = await readMessage({
    abi: erc20ContractAbi,
    api: api,
    contractDeploymentAddress: inputTokenDetails.pendulumErc20WrapperAddress,
    callerAddress: pendulumEphemeralAddress,
    messageName: 'allowance',
    messageArguments: [pendulumEphemeralAddress, NABLA_ROUTER],
    limits: defaultReadLimits,
  });

  if (response.type !== 'success') {
    const message = 'Could not load token allowance';
    console.log(message);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputTokenDetails.pendulumDecimals, response.value);

  //maybe do allowance
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(amountRaw))) {
    try {
      console.log(`Preparing transaction to approve tokens: ${amountRaw} ${inputTokenDetails.pendulumAssetSymbol}`);
      return createApproveExtrinsic({
        api: api,
        amount: amountRaw,
        token: inputTokenDetails.pendulumErc20WrapperAddress,
        spender: NABLA_ROUTER,
        contractAbi: erc20ContractAbi,
        callerAddress: pendulumEphemeralAddress,
      });
    } catch (e) {
      console.log(`Could not approve token: ${e}`);
      return Promise.reject('Could not approve token');
    }
  }

  throw Error("Couldn't create approve extrinsic");
}
