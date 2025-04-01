// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock } from 'bun:test';
import { prepareOnrampTransactions } from './onrampTransactions';

// Mock all external dependencies
mock.module('shared', () => ({
  getNetworkFromDestination: () => 'Moonbeam',
  getNetworkId: () => 1,
  isFiatToken: (currency) => currency === 'BRL',
  getAnyFiatTokenDetails: () => ({
    moonbeamErc20Address: '0xmock',
    decimals: 18,
  }),
  getOnChainTokenDetails: () => ({
    pendulumCurrencyId: 123,
    decimals: 12,
  }),
  getPendulumDetails: () => ({
    pendulumDecimals: 12,
    pendulumCurrencyId: 123,
  }),
  isMoonbeamTokenDetails: () => true,
  isOnChainToken: () => true,
  isOnChainTokenDetails: () => true,
  isEvmTokenDetails: () => true,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN: 0.01,
  Networks: {
    Moonbeam: 'Moonbeam',
    Pendulum: 'Pendulum',
    AssetHub: 'AssetHub',
  },
  FiatToken: { BRL: 'BRL' },
  EvmToken: { USDT: 'USDT' },
}));

// Mock transaction creation modules
mock.module('./xcm/moonbeamToPendulum', () => ({
  createMoonbeamToPendulumXCM: () => Promise.resolve({ mockXCM: true }),
}));

mock.module('./squidrouter/onramp', () => ({
  createOnrampSquidrouterTransactions: () =>
    Promise.resolve({
      approveData: { mockApprove: true },
      swapData: { mockSwap: true },
    }),
}));

mock.module('./nabla', () => ({
  createNablaTransactionsForQuote: () =>
    Promise.resolve({
      approveTransaction: '0xapprove',
      swapTransaction: '0xswap',
    }),
}));

mock.module('./index', () => ({
  encodeEvmTransactionData: (data) => `encoded:${JSON.stringify(data)}`,
  encodeSubmittableExtrinsic: (data) => `encoded:${JSON.stringify(data)}`,
}));

// Mock the app initialization
mock.module('../../../index', () => ({}));

describe('prepareOnrampTransactions', () => {
  const mockQuote = {
    inputAmount: '100',
    outputAmount: '95',
    fee: '5',
    inputCurrency: 'BRL',
    outputCurrency: 'USDT',
    id: 'test-quote-1',
    rampType: 'on',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    status: 'pending',
    from: 'Moonbeam',
    to: 'AssetHub',
  };

  const mockAccounts = [
    {
      address: 'moonbeamAddr',
      network: 'Moonbeam',
    },
    {
      address: 'pendulumAddr',
      network: 'Pendulum',
    },
  ];

  it('should create transactions for Moonbeam and Pendulum networks', async () => {
    const { unsignedTxs } = await prepareOnrampTransactions(mockQuote, mockAccounts, 'destinationAddr');

    expect(unsignedTxs.length).toBeGreaterThan(0);
    // Just check that we have some transactions, the exact number may vary
    // based on the mocked implementation
  });

  it('should throw error for missing Pendulum ephemeral', async () => {
    const badAccounts = mockAccounts.filter((a) => a.network !== 'Pendulum');
    await expect(prepareOnrampTransactions(mockQuote, badAccounts, 'destinationAddr')).rejects.toThrow(
      'Pendulum ephemeral not found',
    );
  });

  it('should validate input token type', async () => {
    const badQuote = {
      ...mockQuote,
      inputCurrency: 'ETH',
    };
    await expect(prepareOnrampTransactions(badQuote, mockAccounts, 'destinationAddr')).rejects.toThrow(
      'Input currency must be fiat token for onramp',
    );
  });
});
