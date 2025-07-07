import { ApiPromise } from "@polkadot/api";
import Big from "big.js";
import BigNumber from "big.js";
import { routerAbi } from "../../contracts/Router.ts";
import type { PendulumTokenDetails } from "../../tokens";
import { contractRead } from "./contractRead";
import {
  type ContractBalance,
  multiplyByPowerOfTen,
  NABLA_ROUTER,
  parseContractBalanceResponse,
  stringifyBigWithSignificantDecimals
} from "./helpers.ts";

export interface TokenOutData {
  preciseQuotedAmountOut?: ContractBalance;
  swapFee?: ContractBalance;
}

export async function getTokenOutAmount(params: {
  api: ApiPromise;
  fromAmountString: string;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  maximumFromAmount?: BigNumber;
}): Promise<TokenOutData> {
  const { api, fromAmountString, inputTokenPendulumDetails, outputTokenPendulumDetails, maximumFromAmount } = params;

  let amountBig: Big;
  try {
    amountBig = new Big(fromAmountString);
  } catch (_error) {
    throw new Error("Invalid amount string provided");
  }

  const fromTokenDecimals = inputTokenPendulumDetails.decimals;
  if (fromTokenDecimals === undefined) {
    throw new Error("Input token decimals not defined");
  }

  const amountIn = multiplyByPowerOfTen(amountBig, fromTokenDecimals).toFixed(0, 0);
  if (maximumFromAmount && amountBig.gt(maximumFromAmount)) {
    throw new Error("Input amount exceeds the maximum allowed");
  }

  const result = await contractRead<TokenOutData>({
    abi: routerAbi,
    address: NABLA_ROUTER,
    api,
    args: [amountIn, [inputTokenPendulumDetails.erc20WrapperAddress, outputTokenPendulumDetails.erc20WrapperAddress]],
    method: "getAmountOut",
    noWalletAddressRequired: true,
    parseError: error => {
      switch (error.type) {
        case "error":
          return "insufficientLiquidity";
        case "panic":
          return error.errorCode === 0x11 ? "insufficientLiquidity" : "Something went wrong";
        case "reverted":
          return error.description === "SwapPool: EXCEEDS_MAX_COVERAGE_RATIO"
            ? "insufficientLiquidity"
            : "Something went wrong";
        default:
          return "Something went wrong";
      }
    },
    parseSuccessOutput: (data: bigint[]) => {
      const preciseQuotedAmountOut = parseContractBalanceResponse(outputTokenPendulumDetails.decimals, data[0]);
      const swapFee = parseContractBalanceResponse(outputTokenPendulumDetails.decimals, data[1]);
      return {
        preciseQuotedAmountOut,
        swapFee
      };
    }
  });
  return result;
}
