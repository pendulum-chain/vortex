import {
  EvmClientManager,
  MoonbeamExecuteXcmRequest,
  MoonbeamExecuteXcmResponse,
  Networks,
  splitReceiverABI
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { Address, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from "../../constants/constants";

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
    const moonbeamExecutorAccount = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
    const { moonbeamClient } = createClients(moonbeamExecutorAccount);
    const evmClientManager = EvmClientManager.getInstance();

    const data = encodeFunctionData({
      abi: splitReceiverABI,
      args: [id, payload],
      functionName: "executeXCM"
    });

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await moonbeamClient.estimateFeesPerGas();
      // Safe to send multiple times. Idempotent.
      const hash = (await evmClientManager.sendTransactionWithBlindRetry(Networks.Moonbeam, moonbeamExecutorAccount, {
        data,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        value: 0n
      })) as `0x${string}`;
      res.json({ hash });
      return;
    } catch (error) {
      logger.error("Error executing XCM:", error);
      res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid transaction" });
      return;
    }
  } catch (error) {
    logger.error("Error executing XCM:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  let moonbeamExecutorAccount;

  try {
    moonbeamExecutorAccount = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
    return { public: moonbeamExecutorAccount.address, status: false };
  } catch (error) {
    logger.error("Error deriving Moonbeam executor address:", error);
    return { public: moonbeamExecutorAccount?.address, status: false };
  }
};
