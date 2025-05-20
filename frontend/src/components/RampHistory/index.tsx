import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useRampHistoryStore } from '../../stores/rampHistoryStore';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import { TransactionItem } from './TransactionItem';
import { TransactionGroup } from './types';
import { fetchTransactions, groupTransactionsByMonth } from './transactionService';

export function RampHistory() {
  const { isActive, actions } = useRampHistoryStore();
  const { address } = useVortexAccount();
  const [transactionGroups, setTransactionGroups] = useState<TransactionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isActive && address) {
      setIsLoading(true);
      fetchTransactions()
        .then((transactions) => {
          const grouped = groupTransactionsByMonth(transactions);
          setTransactionGroups(grouped);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isActive, address]);

  if (!address) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.section
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.5 }}
          className="w-full bg-white z-50 absolute top-0 left-0 bottom-0 right-0 rounded-lg px-4 pt-4 pb-2 overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <h1 className="text-3xl font-bold">History</h1>
            </div>
            <button onClick={actions.toggleHistory} className="btn-vortex-accent p-2 rounded-full cursor-pointer">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          <hr />
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : transactionGroups.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <p className="text-gray-500">Your transaction history will appear here.</p>
              </div>
            ) : (
              transactionGroups.map((group) => (
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
