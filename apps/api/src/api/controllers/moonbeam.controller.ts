import { MoonbeamExecuteXcmRequest, MoonbeamExecuteXcmResponse, Networks } from "@packages/shared";
import Big from "big.js";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { Address, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import splitReceiverABI from "../../../mooncontracts/splitReceiverABI.json";
import {
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  MOONBEAM_FUNDING_AMOUNT_UNITS,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS
} from "../../constants/constants";
import { EvmClientManager } from "../services/evm/clientManager";
import { SlackNotifier } from "../services/slack.service";

interface StatusResponse {
  status: boolean;
  public: Address | undefined;
}

const createClients = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
  const evmClientManager = EvmClientManager.getInstance();
  const moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);
  const walletClient = evmClientManager.getWalletClient(Networks.Moonbeam, executorAccount);

  return { moonbeamClient, walletClient };
};

export const executeXcmController = async (
  req: Request<unknown, unknown, MoonbeamExecuteXcmRequest>,
  res: Response<MoonbeamExecuteXcmResponse | { error: string }>
): Promise<void> => {
  const { id, payload } = req.body;

  try {
    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { walletClient, moonbeamClient } = createClients(moonbeamExecutorAccount);

    const data = encodeFunctionData({
      abi: splitReceiverABI,
      args: [id, payload],
      functionName: "executeXCM"
    });

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await moonbeamClient.estimateFeesPerGas();
      const hash = await walletClient.sendTransaction({
        data,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        value: 0n
      });
      res.json({ hash });
      return;
    } catch (error) {
      console.error("Error executing XCM:", error);
      res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid transaction" });
      return;
    }
  } catch (error) {
    console.error("Error executing XCM:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  const slackService = new SlackNotifier();
  let moonbeamExecutorAccount;

  try {
    moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { moonbeamClient } = createClients(moonbeamExecutorAccount);

    const balance = await moonbeamClient.getBalance({
      address: moonbeamExecutorAccount.address
    });
    const minimumBalance = BigInt(Big(MOONBEAM_FUNDING_AMOUNT_UNITS).times(Big(10).pow(18)).toString());

    if (balance < minimumBalance) {
      await slackService.sendMessage({
        text: `Current balance of funding account is ${balance} GLMR please charge the account ${moonbeamExecutorAccount.address}.`
      });
      return { public: moonbeamExecutorAccount.address, status: false };
    }

    return { public: moonbeamExecutorAccount.address, status: true };
  } catch (error) {
    console.error("Error fetching Moonbeam executor balance:", error);
    return { public: moonbeamExecutorAccount?.address, status: false };
  }
};
