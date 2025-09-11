import { Transaction, TransactionGroup } from "./types";

export const groupRampHistoryByMonth = (transactions: Transaction[]): TransactionGroup[] => {
  const groupedTransactions = transactions.reduce<{ [key: string]: Transaction[] }>((groups, transaction) => {
    const month = transaction.date.toLocaleString("default", { month: "long", year: "numeric" });
    return {
      ...groups,
      [month]: [...(groups[month] || []), transaction]
    };
  }, {});

  return Object.entries(groupedTransactions)
    .map(([month, transactions]) => ({
      month,
      transactions: [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime())
    }))
    .sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateB.getTime() - dateA.getTime();
    });
};
