const { createWalletClient, createPublicClient, http, encodeFunctionData } = require('viem');
const { moonbeam } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const { MOONBEAM_EXECUTOR_PRIVATE_KEY, MOONBEAM_RECEIVER_CONTRACT_ADDRESS } = require('../../constants/constants');
const splitReceiverABI = require('../../../../mooncontracts/splitReceiverABI.json');

const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY);

exports.executeXcmControlller = async (req, res) => {
  const { id, payload } = req.body;

  if (!id) {
    return res.status(400).send({ error: 'Request parameters "id" missing' });
  }

  if (!payload) {
    return res.status(400).send({ error: 'Request parameters "payload" missing' });
  }

  try {
    const walletClient = createWalletClient({
      account: moonbeamExecutorAccount,
      chain: moonbeam,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain: moonbeam,
      transport: http(),
    });

    const data = encodeFunctionData({
      abi: splitReceiverABI,
      functionName: 'executeXCM',
      args: [id, payload],
    });

    const hash = await walletClient.sendTransaction({
      to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
      value: 0n,
      data,
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.send({ status: 'success' });
  } catch (error) {
    console.error('Error executing XCM:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};
