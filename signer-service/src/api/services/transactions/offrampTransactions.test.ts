// @ts-nocheck - Ignore type errors for testing
import { describe, it, expect, mock } from 'bun:test';
import type { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import type { AccountMeta } from '../ramp/ramp.service';
import { prepareOfframpTransactions } from './offrampTransactions';

// Mock all external dependencies
mock.module('shared', () => ({
  getNetworkFromDestination: () => 'Moonbeam',
  getNetworkId: (network) => {
    if (network === 'Moonbeam') return 1;
    if (network === 'Pendulum') return 2;
    if (network === 'Stellar') return 3;
    return 0;
  },
  isFiatToken: (currency) => currency === 'BRL' || currency === 'USDC',
  isOnChainToken: (currency) => currency === 'USDT',
  getAnyFiatTokenDetails: () => ({
    moonbeamErc20Address: '0xmoonbeamMock',
    decimals: 18,
    pendulumCurrencyId: 123
  }),
  getOnChainTokenDetails: () => ({
    pendulumCurrencyId: 123,
    decimals: 12
  }),
  getPendulumDetails: () => ({
    pendulumDecimals: 12,
    pendulumCurrencyId: 123
  }),
  isEvmTokenDetails: () => true,
  isStellarOutputTokenDetails: () => true,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN: 0.01,
  FiatToken: { BRL: 'BRL' },
  Networks: {
    Moonbeam: 'Moonbeam',
    Pendulum: 'Pendulum',
    Stellar: 'Stellar'
  },
  EvmToken: { USDT: 'USDT' }
}));

// Mock transaction creation modules
mock.module('./squidrouter/offramp', () => ({
  createOfframpSquidrouterTransactions: mock(async () => ({
    approveData: { mockApprove: true },
    swapData: { mockSwap: true }
  }))
}));

mock.module('./nabla', () => ({
  createNablaTransactionsForQuote: mock(async () => ({
    approveTransaction: '0xapprove',
    swapTransaction: '0xswap'
  }))
}));

mock.module('./xcm/pendulumToMoonbeam', () => ({
  createPendulumToMoonbeamTransfer: mock(async () => ({
    mockXCM: true
  }))
}));

mock.module('./spacewalk/redeem', () => ({
  prepareSpacewalkRedeemTransaction: mock(async () => ({
    mockSpacewalk: true
  }))
}));

mock.module('./stellar/offrampTransaction', () => ({
  buildPaymentAndMergeTx: mock(async () => ({
    paymentTransaction: 'stellarPaymentTx',
    mergeAccountTransaction: 'stellarMergeTx',
    startingSequenceNumber: '1'
  }))
}));

mock.module('./index', () => ({
  encodeEvmTransactionData: (data: any) => `encoded:${JSON.stringify(data)}`,
  encodeSubmittableExtrinsic: (data: any) => `encoded:${JSON.stringify(data)}`
}));

mock.module('stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: (pubKey: string) => ({
      rawPublicKey: () => new Uint8Array([1, 2, 3, 4])
    })
  }
}));

describe('prepareOfframpTransactions', () => {
  const mockQuote = {
    inputAmount: '100',
    outputAmount: '95',
    fee: '5',
    inputCurrency: 'USDT',
    outputCurrency: 'BRL',
    id: 'test-quote-1',
    rampType: 'off',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    status: 'pending',
    from: 'Moonbeam',
    to: 'Stellar'
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
    {
      address: 'stellarAddr',
      network: 'Stellar',
    }
  ];

  const mockStellarPaymentData = {
    offrampingAccount: 'stellarPubKey',
    destinationAccount: 'stellarDestination',
    memo: 'test-memo',
    amount: '100',
    memoType: 'text' as 'text' | 'hash'
  };

  it('should create transactions for EVM input token', async () => {
    const { unsignedTxs } = await prepareOfframpTransactions(
      mockQuote,
      mockAccounts,
      mockStellarPaymentData,
      'userAddress'
    );

    expect(unsignedTxs.length).toBeGreaterThan(0);
    expect(unsignedTxs.some(tx => tx.phase === 'squidrouterApprove')).toBe(true);
    expect(unsignedTxs.some(tx => tx.phase === 'squidrouterSwap')).toBe(true);
  });

  it('should create Nabla transactions for Pendulum account', async () => {
    const { unsignedTxs } = await prepareOfframpTransactions(
      mockQuote,
      mockAccounts,
      mockStellarPaymentData,
      'userAddress'
    );

    expect(unsignedTxs.some(tx => tx.phase === 'nablaApprove')).toBe(true);
    expect(unsignedTxs.some(tx => tx.phase === 'nablaSwap')).toBe(true);
  });

  it('should create pendulumToMoonbeam transaction for BRL output', async () => {
    const brlQuote = {
      ...mockQuote,
      outputCurrency: 'BRL'
    };

    const { unsignedTxs } = await prepareOfframpTransactions(
      brlQuote,
      mockAccounts,
      mockStellarPaymentData,
      'userAddress'
    );

    expect(unsignedTxs.some(tx => tx.phase === 'pendulumToMoonbeam')).toBe(true);
  });

  it('should create Stellar transactions for non-BRL output', async () => {
    // Mock isStellarOutputTokenDetails to return true
    const nonBrlQuote = {
      ...mockQuote,
      outputCurrency: 'USDC' // Not BRL
    };

    const { unsignedTxs } = await prepareOfframpTransactions(
      nonBrlQuote,
      mockAccounts,
      mockStellarPaymentData,
      'userAddress'
    );

    expect(unsignedTxs.some(tx => tx.phase === 'stellarPayment')).toBe(true);
    expect(unsignedTxs.some(tx => tx.phase === 'stellarCleanup')).toBe(true);
  });

  it('should throw error for missing Stellar ephemeral', async () => {
    const badAccounts = mockAccounts.filter(a => a.network !== 'Stellar');
    
    await expect(
      prepareOfframpTransactions(mockQuote, badAccounts, mockStellarPaymentData, 'userAddress')
    ).rejects.toThrow('Stellar ephemeral not found');
  });

  it('should throw error for missing Pendulum ephemeral', async () => {
    const badAccounts = mockAccounts.filter(a => a.network !== 'Pendulum');
    
    await expect(
      prepareOfframpTransactions(mockQuote, badAccounts, mockStellarPaymentData, 'userAddress')
    ).rejects.toThrow('Pendulum ephemeral not found');
  });

  it('should throw error for missing Moonbeam ephemeral', async () => {
    const badAccounts = mockAccounts.filter(a => a.network !== 'Moonbeam');
    
    await expect(
      prepareOfframpTransactions(mockQuote, badAccounts, mockStellarPaymentData, 'userAddress')
    ).rejects.toThrow('Moonbeam ephemeral not found');
  });

  it('should throw error for missing userAddress with EVM input token', async () => {
    await expect(
      prepareOfframpTransactions(mockQuote, mockAccounts, mockStellarPaymentData)
    ).rejects.toThrow('User address must be provided for offramping from EVM network');
  });

  it('should throw error for missing Stellar payment data with non-BRL output', async () => {
    const nonBrlQuote = {
      ...mockQuote,
      outputCurrency: 'USDC' // Not BRL
    };

    await expect(
      prepareOfframpTransactions(nonBrlQuote, mockAccounts, undefined, 'userAddress')
    ).rejects.toThrow('Stellar payment data must be provided for offramp');
  });
});
