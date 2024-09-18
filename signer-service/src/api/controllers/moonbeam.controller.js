const { createWalletClient, createPublicClient, http, encodeFunctionData } = require('viem');
const { moonbeam } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const { MOONBEAM_EXECUTOR_PRIVATE_KEY, MOONBEAM_RECEIVER_CONTRACT_ADDRESS } = require('../../constants/constants');
const splitReceiverABI = require('../../../../mooncontracts/splitReceiverABI.json');

const transactionCache = {};

exports.executeXcmController = async (req, res) => {
  const { id, payload } = req.body;
  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY);

  const cacheKey = `${id}_${JSON.stringify(payload)}`;

  if (transactionCache[cacheKey]) {
    return res.send({ hash: transactionCache[cacheKey] });
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

    const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

    let hash;
    try {
      hash = await walletClient.sendTransaction({
        to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        value: 0n,
        data,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      transactionCache[cacheKey] = hash;
    } catch (error) {
      console.error('Error executing XCM:', error);
      res.status(400).send({ error: 'Invalid transaction' });
    }

    res.send({ hash });
  } catch (error) {
    console.error('Error executing XCM:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};
