const { createWalletClient, createPublicClient, http, encodeFunctionData } = require('viem');
const { moonbeam } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const {
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
  MOONBEAM_FUNDING_AMOUNT_UNITS,
} = require('../../constants/constants');
const splitReceiverABI = require('../../../../mooncontracts/splitReceiverABI.json');

exports.executeXcmController = async (req, res) => {
  const { id, payload } = req.body;
  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY);

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

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
      const hash = await walletClient.sendTransaction({
        to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        value: 0n,
        data,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      return res.send({ hash });
    } catch (error) {
      console.error('Error executing XCM:', error);
      res.status(400).send({ error: 'Invalid transaction' });
    }
  } catch (error) {
    console.error('Error executing XCM:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};

exports.sendStatusWithPk = async () => {
  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY);

  try {
    const publicClient = createPublicClient({
      chain: moonbeam,
      transport: http(),
    });
    const balance = await publicClient.getBalance({ address: moonbeamExecutorAccount.address });

    // We are checking if the balance is less than 10 GLMR
    let minimum_balance = MOONBEAM_FUNDING_AMOUNT_UNITS * 10 ** 18;
    if (balance < minimum_balance) {
      return { status: false, public: moonbeamExecutorAccount.address };
    } else {
      return { status: true, public: moonbeamExecutorAccount.address };
    }
  } catch (error) {
    console.error('Error fetching Moonbeam executor balance:', error);
    return { status: false, public: moonbeamExecutorAccount.address };
  }
};
