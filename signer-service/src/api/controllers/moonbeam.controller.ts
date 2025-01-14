import { createWalletClient, createPublicClient, http, encodeFunctionData, Address } from 'viem';
import { moonbeam } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import Big from 'big.js';
import { Request, Response } from 'express';

import {
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
  MOONBEAM_FUNDING_AMOUNT_UNITS,
} from '../../constants/constants';
import { SlackNotifier } from '../services/slack.service';

import splitReceiverABI from '../../../../mooncontracts/splitReceiverABI.json';

interface StatusResponse {
  status: boolean;
  public: Address | undefined;
}

const createClients = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
  const walletClient = createWalletClient({
    account: executorAccount,
    chain: moonbeam,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http(),
  });

  return { walletClient, publicClient };
};

export const executeXcmController = async (req: Request, res: Response): Promise<void> => {
  const { id, payload } = req.body;

  try {
    if (!MOONBEAM_EXECUTOR_PRIVATE_KEY) {
      throw new Error('Moonbeam executor private key not configured');
    }
    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { walletClient, publicClient } = createClients(moonbeamExecutorAccount);

    const data = encodeFunctionData({
      abi: splitReceiverABI,
      functionName: 'executeXCM',
      args: [id, payload],
    });

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
      const hash = await walletClient.sendTransaction({
        to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        value: 0n,
        data,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      res.json({ hash });
      return;
    } catch (error) {
      console.error('Error executing XCM:', error);
      res.status(400).json({ error: 'Invalid transaction' });
      return;
    }
  } catch (error) {
    console.error('Error executing XCM:', error);
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }
};

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  const slackService = new SlackNotifier();
  let moonbeamExecutorAccount;

  try {
    if (!MOONBEAM_EXECUTOR_PRIVATE_KEY) {
      throw new Error('Moonbeam executor private key not configured');
    }
    moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { publicClient } = createClients(moonbeamExecutorAccount);

    const balance = await publicClient.getBalance({ address: moonbeamExecutorAccount.address });
    const minimumBalance = BigInt(Big(MOONBEAM_FUNDING_AMOUNT_UNITS).times(Big(10).pow(18)).toString());

    if (balance < minimumBalance) {
      await slackService.sendMessage({
        text: `Current balance of funding account is ${balance} GLMR please charge the account ${moonbeamExecutorAccount.address}.`,
      });
      return { status: false, public: moonbeamExecutorAccount.address };
    }

    return { status: true, public: moonbeamExecutorAccount.address };
  } catch (error) {
    console.error('Error fetching Moonbeam executor balance:', error);
    return { status: false, public: moonbeamExecutorAccount?.address };
  }
};
