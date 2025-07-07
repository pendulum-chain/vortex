import { createExecuteMessageExtrinsic, type Extrinsic } from "@pendulum-chain/api-solang";
import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { routerAbi } from "../../contracts/Router.ts";
import { NABLA_ROUTER, type PendulumTokenDetails } from "../../tokens";
import { createWriteOptions, defaultWriteLimits } from "./helpers.ts";
import type { ExtrinsicOptions } from "./index.ts";

export interface PrepareNablaSwapParams {
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  amountRaw: string;
  nablaHardMinimumOutputRaw: string;
  callerAddress: string;
  pendulumNode: ApiPromise;
}

interface CreateSwapExtrinsicOptions {
  api: ApiPromise;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  amountMin: string;
  contractAbi: Abi;
  callerAddress: string;
}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;

export async function createSwapExtrinsic({
  api,
  tokenIn,
  tokenOut,
  amount,
  amountMin,
  contractAbi,
  callerAddress
}: CreateSwapExtrinsicOptions) {
  const extrinsicOptions: ExtrinsicOptions = {
    callerAddress,
    contractDeploymentAddress: NABLA_ROUTER,
    gasLimitTolerancePercentage: 10,
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
    messageArguments: [amount, amountMin, [tokenIn, tokenOut], callerAddress, calcDeadline(60 * 24 * 7)], // 7 days deadline
    messageName: "swapExactTokensForTokens", // Allow 3 fold gas tolerance
    skipDryRunning: true // We have to skip this because it will not work before the approval transaction executed
  };

  const { execution } = await createExecuteMessageExtrinsic({
    ...extrinsicOptions,
    abi: contractAbi,
    api
  });

  if (execution.type === "onlyRpc") {
    throw Error("Couldn't create swap extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;
  return { extrinsic, extrinsicOptions };
}

export async function prepareNablaSwapTransaction({
  inputTokenPendulumDetails,
  outputTokenPendulumDetails,
  amountRaw,
  nablaHardMinimumOutputRaw,
  callerAddress,
  pendulumNode
}: PrepareNablaSwapParams): Promise<{
  extrinsic: Extrinsic;
  extrinsicOptions: ExtrinsicOptions;
}> {
  const api = pendulumNode;

  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());

  // Try create swap extrinsic
  try {
    console.log(
      `Preparing transaction to swap tokens: ${amountRaw} ${inputTokenPendulumDetails.assetSymbol} -> min ${nablaHardMinimumOutputRaw} ${outputTokenPendulumDetails.assetSymbol}`
    );
    return createSwapExtrinsic({
      amount: amountRaw,
      amountMin: nablaHardMinimumOutputRaw,
      api,
      callerAddress: callerAddress,
      contractAbi: routerAbiObject,
      tokenIn: inputTokenPendulumDetails.erc20WrapperAddress,
      tokenOut: outputTokenPendulumDetails.erc20WrapperAddress
    });
  } catch (e) {
    console.error(`Error creating swap extrinsic: ${e}`);
    throw Error("Couldn't create swap extrinsic");
  }
}
