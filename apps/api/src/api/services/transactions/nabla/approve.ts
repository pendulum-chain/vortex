import { NABLA_ROUTER, PendulumDetails } from '@packages/shared';
import { Extrinsic, ReadMessageResult, createExecuteMessageExtrinsic, readMessage } from '@pendulum-chain/api-solang';
import { ApiPromise } from '@polkadot/api';
import { Abi } from '@polkadot/api-contract';
import Big from 'big.js';
import logger from '../../../../config/logger';
import { erc20WrapperAbi } from '../../../../contracts/ERC20Wrapper';
import {
  createWriteOptions,
  defaultReadLimits,
  defaultWriteLimits,
  parseContractBalanceResponse,
} from '../../../helpers/contracts';
import { API } from '../../pendulum/apiManager';
import { ExtrinsicOptions } from './index';

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
  const extrinsicOptions: ExtrinsicOptions = {
    callerAddress,
    contractDeploymentAddress: token,
    messageName: 'approve',
    messageArguments: [spender, amount],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  };

  const { execution, result: readMessageResult } = await createExecuteMessageExtrinsic({
    ...extrinsicOptions,
    api,
    abi: contractAbi,
  });

  if (execution.type === 'onlyRpc') {
    throw Error("Couldn't create approve extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;

  return { extrinsic, extrinsicOptions };
}

export async function prepareNablaApproveTransaction({
  inputTokenDetails,
  amountRaw,
  pendulumEphemeralAddress,
  pendulumNode,
}: PrepareNablaApproveParams): Promise<{
  extrinsic: Extrinsic;
  extrinsicOptions: ExtrinsicOptions;
}> {
  const { api } = pendulumNode;

  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());

  // call the current allowance of the ephemeral
  const response: ReadMessageResult = await readMessage({
    abi: erc20ContractAbi,
    api,
    contractDeploymentAddress: inputTokenDetails.pendulumErc20WrapperAddress,
    callerAddress: pendulumEphemeralAddress,
    messageName: 'allowance',
    messageArguments: [pendulumEphemeralAddress, NABLA_ROUTER],
    limits: defaultReadLimits,
  });

  if (response.type !== 'success') {
    const message = 'Could not load token allowance';
    logger.info(message);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputTokenDetails.pendulumDecimals, response.value);

  // maybe do allowance
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(amountRaw))) {
    try {
      logger.info(`Preparing transaction to approve tokens: ${amountRaw} ${inputTokenDetails.pendulumAssetSymbol}`);
      return createApproveExtrinsic({
        api,
        amount: amountRaw,
        token: inputTokenDetails.pendulumErc20WrapperAddress,
        spender: NABLA_ROUTER,
        contractAbi: erc20ContractAbi,
        callerAddress: pendulumEphemeralAddress,
      });
    } catch (e) {
      logger.info(`Could not approve token: ${e}`);
      return Promise.reject('Could not approve token');
    }
  }

  throw Error("Couldn't create approve extrinsic");
}
