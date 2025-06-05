import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import { useRampHistoryStore } from '../../stores/rampHistoryStore';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import { useRampHistory } from '../../hooks/useRampHistory';

import { groupRampHistoryByMonth } from './helpers';
import { TransactionItem } from './TransactionItem';
import { TransactionGroup } from './types';

export function RampHistory() {
  const { isActive, actions } = useRampHistoryStore();
  const { address } = useVortexAccount();
  const { data, isLoading, refetch } = useRampHistory(address);

  useEffect(() => {
    if (isActive && address) {
      refetch();
    }
  }, [isActive, address, refetch]);

  const rampHistoryGroups: TransactionGroup[] = data?.transactions ? groupRampHistoryByMonth(data.transactions) : [];

  return (
    <AnimatePresence>
      {isActive && (
        <motion.section
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.5 }}
          className="w-full bg-white z-50 absolute top-0 left-0 bottom-0 right-0 rounded-lg px-4 pt-4 pb-2 overflow-hidden flex flex-col shadow-lg"
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <h1 className="text-3xl font-bold">History</h1>
            </div>
            <button onClick={actions.toggleHistory} className="btn-vortex-accent p-2 rounded-full cursor-pointer">
              <XMarkIcon className="w-4 h-4" tabIndex={1} />
            </button>
          </div>
          <hr />
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : rampHistoryGroups.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <p className="text-gray-500">Your ramp history will appear here.</p>
              </div>
            ) : (
              rampHistoryGroups.map((group) => (
                <div key={group.month} className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-700 mb-2">{group.month}</h2>
                  {group.transactions.map((transaction) => (
                    <TransactionItem key={transaction.id} transaction={transaction} />
                  ))}
                </div>
              ))
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
