import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { useRampHistory } from "../../hooks/useRampHistory";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { useRampHistoryStore } from "../../stores/rampHistoryStore";
import { PageHeader } from "../PageHeader";
import { groupRampHistoryByMonth } from "./helpers";
import { TransactionItem } from "./TransactionItem";
import { TransactionGroup } from "./types";

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
          animate={{ x: 0 }}
          className="absolute top-0 right-0 bottom-0 left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg"
          exit={{ x: "100%" }}
          initial={{ x: "100%" }}
          transition={{ duration: 0.5 }}
        >
          <PageHeader onClose={actions.toggleHistory} title="History" />
          <hr />
          <div className="no-scrollbar flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-gray-900 border-b-2"></div>
              </div>
            ) : rampHistoryGroups.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-gray-500">Your ramp history will appear here.</p>
              </div>
            ) : (
              rampHistoryGroups.map(group => (
                <div className="mb-6" key={group.month}>
                  <h2 className="mb-2 font-semibold text-gray-700 text-lg">{group.month}</h2>
                  {group.transactions.map(transaction => (
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
