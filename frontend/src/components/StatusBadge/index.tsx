import { FC } from 'react';
import { TransactionStatus } from '../RampHistory/types';

export const StatusBadge: FC<{ status: TransactionStatus }> = ({ status }) => {
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
