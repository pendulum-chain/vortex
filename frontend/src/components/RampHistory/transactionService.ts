import { Networks } from 'shared';
import { Transaction, TransactionGroup } from './types';

const mockTransactions: Transaction[] = [
  {
    id: '1',
    fromNetwork: Networks.Base,
    toNetwork: 'pix',
    fromAmount: '100',
    toAmount: '99.956457',
    status: 'success',
    date: new Date('2024-05-15T14:14:00'),
    fromCurrency: 'USDC',
    toCurrency: 'BRL',
  },
  {
    id: '2',
    fromNetwork: 'pix',
    toNetwork: Networks.Polygon,
    fromAmount: '500',
    toAmount: '498.5',
    status: 'pending',
    date: new Date('2024-05-14T10:30:00'),
    fromCurrency: 'BRL',
    toCurrency: 'USDC',
  },
  {
    id: '3',
    fromNetwork: Networks.Ethereum,
    toNetwork: 'pix',
    fromAmount: '200',
    toAmount: '199.5',
    status: 'failed',
    date: new Date('2024-04-20T15:45:00'),
    fromCurrency: 'USDT',
    toCurrency: 'BRL',
  },
  {
    id: '4',
    fromNetwork: Networks.Base,
    toNetwork: 'pix',
    fromAmount: '100',
    toAmount: '99.956457',
    status: 'success',
    date: new Date('2024-02-15T14:14:00'),
    fromCurrency: 'USDC',
    toCurrency: 'BRL',
  },
  {
    id: '5',
    fromNetwork: Networks.Base,
    toNetwork: 'pix',
    fromAmount: '100',
    toAmount: '99.956457',
    status: 'success',
    date: new Date('2024-02-15T14:14:00'),
    fromCurrency: 'USDC',
    toCurrency: 'BRL',
  },
  {
    id: '6',
    fromNetwork: Networks.Base,
    toNetwork: 'pix',
    fromAmount: '100',
    toAmount: '99.956457',
    status: 'success',
    date: new Date('2024-01-15T14:14:00'),
    fromCurrency: 'USDC',
    toCurrency: 'BRL',
  },
  {
    id: '7',
    fromNetwork: Networks.Base,
    toNetwork: 'pix',
    fromAmount: '100',
    toAmount: '99.956457',
    status: 'success',
    date: new Date('2024-01-12T14:14:00'),
    fromCurrency: 'USDC',
    toCurrency: 'BRL',
  },
];

export const fetchTransactions = async (): Promise<Transaction[]> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockTransactions;
};

export const groupTransactionsByMonth = (transactions: Transaction[]): TransactionGroup[] => {
  const groups: { [key: string]: Transaction[] } = {};

  transactions.forEach((transaction) => {
    const month = transaction.date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groups[month]) {
      groups[month] = [];
    }
    groups[month].push(transaction);
  });

  return Object.entries(groups)
    .map(([month, transactions]) => ({
      month,
      transactions: transactions.sort((a, b) => b.date.getTime() - a.date.getTime()),
    }))
    .sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateB.getTime() - dateA.getTime();
    });
};
