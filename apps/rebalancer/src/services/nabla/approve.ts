import { createExecuteMessageExtrinsic, type Extrinsic, type ReadMessageResult, readMessage } from "@pendulum-chain/api-solang";
import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import Big from "big.js";
import { erc20WrapperAbi } from "../../contracts/Erc20Wrapper.ts";
import { NABLA_ROUTER, type PendulumTokenDetails } from "../../tokens";
import { createWriteOptions, defaultReadLimits, defaultWriteLimits, parseContractBalanceResponse } from "./helpers.ts";
import type { ExtrinsicOptions } from "./index.ts";

export interface PrepareNablaApproveParams {
  inputTokenPendulumDetails: PendulumTokenDetails;
  amountRaw: string;
  callerAddress: string;
  pendulumNode: ApiPromise;
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
  callerAddress
}: CreateApproveExtrinsicOptions) {
  const extrinsicOptions: ExtrinsicOptions = {
    callerAddress,
    contractDeploymentAddress: token,
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    messageArguments: [spender, amount],
    messageName: "approve"
  };

  const { execution } = await createExecuteMessageExtrinsic({
    ...extrinsicOptions,
    abi: contractAbi,
    api
  });

  if (execution.type === "onlyRpc") {
    throw Error("Couldn't create approve extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;

  return { extrinsic, extrinsicOptions };
}

export async function prepareNablaApproveTransaction({
  inputTokenPendulumDetails,
  amountRaw,
  callerAddress,
  pendulumNode
}: PrepareNablaApproveParams): Promise<{
  extrinsic: Extrinsic;
  extrinsicOptions: ExtrinsicOptions;
}> {
  const api = pendulumNode;

  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());

  // call the current allowance of the ephemeral
  const response: ReadMessageResult = await readMessage({
    abi: erc20ContractAbi,
    api,
    callerAddress: callerAddress,
    contractDeploymentAddress: inputTokenPendulumDetails.erc20WrapperAddress,
    limits: defaultReadLimits,
    messageArguments: [callerAddress, NABLA_ROUTER],
    messageName: "allowance"
  });

  if (response.type !== "success") {
    const message = "Could not load token allowance";
    console.log(message);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputTokenPendulumDetails.decimals, response.value);

  // maybe do allowance
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(amountRaw))) {
    try {
      console.log(`Preparing transaction to approve tokens: ${amountRaw} ${inputTokenPendulumDetails.assetSymbol}`);
      return createApproveExtrinsic({
        amount: amountRaw,
        api,
        callerAddress: callerAddress,
        contractAbi: erc20ContractAbi,
        spender: NABLA_ROUTER,
        token: inputTokenPendulumDetails.erc20WrapperAddress
      });
    } catch (e) {
      console.log(`Could not approve token: ${e}`);
      return Promise.reject("Could not approve token");
    }
  }

  throw Error("Couldn't create approve extrinsic");
}
