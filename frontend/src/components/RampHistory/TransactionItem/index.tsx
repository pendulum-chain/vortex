import { FC } from 'react';
import { useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { getNetworkDisplayName, Networks } from 'shared';
import { Transaction } from '../types';
import { ChevronRightIcon } from '@heroicons/react/20/solid';

interface TransactionItemProps {
  transaction: Transaction;
}

const StatusBadge: FC<{ status: Transaction['status'] }> = ({ status }) => {
  const colors = {
    success: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export const TransactionItem: FC<TransactionItemProps> = ({ transaction }) => {
  const fromIcon = useGetAssetIcon(transaction.fromCurrency.toLowerCase());
  const toIcon = useGetAssetIcon(transaction.toCurrency.toLowerCase());

  const formatDate = (date: Date) =>
    date.toLocaleString('default', {
      month: 'long',
      day: 'numeric',
    });

  const getNetworkName = (network: Transaction['fromNetwork'] | Transaction['toNetwork']) => {
    if (typeof network === 'string' && ['pix', 'sepa', 'cbu'].includes(network)) {
      return network.toUpperCase();
    }
    return getNetworkDisplayName(network as Networks);
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        <div>
          <div className="relative w-16 h-8">
            <img src={fromIcon} alt={transaction.fromCurrency} className="w-8 h-8 absolute top-0 left-0" />
            <img src={toIcon} alt={transaction.toCurrency} className="w-8 h-8 absolute top-0 left-5" />
          </div>
        </div>
        <div>
          <div className="flex items-center">
            <span className="text-gray-500">{getNetworkName(transaction.fromNetwork)}</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">{getNetworkName(transaction.toNetwork)}</span>
          </div>
          <div className="flex items-center">
            <span className="font-medium">{transaction.fromAmount}</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{transaction.toAmount}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <StatusBadge status={transaction.status} />
        <div className="text-sm text-gray-500">
          <div>{formatDate(transaction.date)}</div>
        </div>
      </div>
    </div>
  );
};
