import { createExecuteMessageExtrinsic, Extrinsic, ReadMessageResult, readMessage } from "@pendulum-chain/api-solang";
import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { erc20WrapperAbi } from "../../../contracts/ERC20Wrapper";
import {
  createWriteOptions,
  defaultReadLimits,
  defaultWriteLimits,
  NABLA_ROUTER,
  PendulumTokenDetails,
  parseContractBalanceResponse
} from "../../../index";
import logger from "../../../logger";
import { API } from "../../pendulum/apiManager";
import { ExtrinsicOptions } from "./index";

export interface PrepareNablaApproveParams {
  inputTokenPendulumDetails: PendulumTokenDetails;
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
  pendulumEphemeralAddress,
  pendulumNode
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
    callerAddress: pendulumEphemeralAddress,
    contractDeploymentAddress: inputTokenPendulumDetails.erc20WrapperAddress,
    limits: defaultReadLimits,
    messageArguments: [pendulumEphemeralAddress, NABLA_ROUTER],
    messageName: "allowance"
  });

  if (response.type !== "success") {
    const message = "Could not load token allowance";
    logger.current.info(message);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputTokenPendulumDetails.decimals, response.value);
  logger.current.debug("Current allowance:", currentAllowance.toString());

  try {
    logger.current.info(`Preparing transaction to approve tokens: ${amountRaw} ${inputTokenPendulumDetails.assetSymbol}`);
    return createApproveExtrinsic({
      amount: amountRaw,
      api,
      callerAddress: pendulumEphemeralAddress,
      contractAbi: erc20ContractAbi,
      spender: NABLA_ROUTER,
      token: inputTokenPendulumDetails.erc20WrapperAddress
    });
  } catch (e) {
    logger.current.info(`Could not approve token: ${e}`);
    return Promise.reject("Could not approve token");
  }
}
