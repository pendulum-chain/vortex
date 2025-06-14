import { ChevronRightIcon } from '@heroicons/react/20/solid';
import Big from 'big.js';
import { FC } from 'react';

import { Networks, getNetworkDisplayName, roundDownToSignificantDecimals } from '@packages/shared';
import { useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { StatusBadge } from '../../StatusBadge';
import { Transaction } from '../types';

interface TransactionItemProps {
  transaction: Transaction;
}

const formatDate = (date: Date) =>
  date.toLocaleString('default', {
    month: 'long',
    day: 'numeric',
  });

const formatTooltipDate = (date: Date) =>
  date.toLocaleString('default', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

const getNetworkName = (network: Transaction['fromNetwork'] | Transaction['toNetwork']) => {
  if (typeof network === 'string' && ['pix', 'sepa', 'cbu'].includes(network)) {
    return network.toUpperCase();
  }
  return getNetworkDisplayName(network as Networks);
};

export const TransactionItem: FC<TransactionItemProps> = ({ transaction }) => {
  const fromIcon = useGetAssetIcon(transaction.fromCurrency.toLowerCase());
  const toIcon = useGetAssetIcon(transaction.toCurrency.toLowerCase());

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
            <span className="font-medium">
              {roundDownToSignificantDecimals(Big(transaction.fromAmount), 2).toString()}
            </span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            <span className="font-medium">
              {roundDownToSignificantDecimals(Big(transaction.toAmount), 2).toString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <StatusBadge status={transaction.status} />
        <div className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
          <div className="tooltip tooltip-left z-50" data-tip={formatTooltipDate(transaction.date)}>
            {formatDate(transaction.date)}
          </div>
        </div>
      </div>
    </div>
  );
};
