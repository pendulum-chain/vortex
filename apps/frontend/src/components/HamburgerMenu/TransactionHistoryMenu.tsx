import { useTranslation } from "react-i18next";
import { useRampHistory } from "../../hooks/useRampHistory";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { groupRampHistoryByMonth } from "../RampHistory/helpers";
import { TransactionItem } from "../RampHistory/TransactionItem";
import { TransactionGroup } from "../RampHistory/types";

export const TransactionHistoryMenu = () => {
  const { t } = useTranslation();
  const { isDisconnected } = useVortexAccount();
  const { data, isLoading } = useRampHistory();

  if (isDisconnected) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-gray-500 text-sm">{t("Connect wallet to view transaction history")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-gray-900 border-b-2"></div>
      </div>
    );
  }

  const rampHistoryGroups: TransactionGroup[] = data?.transactions ? groupRampHistoryByMonth(data.transactions) : [];

  if (rampHistoryGroups.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-gray-500 text-sm">{t("No transaction history found")}</p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {rampHistoryGroups.slice(0, 2).map(group => (
        <div className="mb-4" key={group.month}>
          <h3 className="mb-2 font-medium text-gray-700 text-sm">{group.month}</h3>
          {group.transactions.slice(0, 3).map(transaction => (
            <div className="mb-2 scale-90" key={transaction.id}>
              <TransactionItem transaction={transaction} />
            </div>
          ))}
        </div>
      ))}
      {rampHistoryGroups.length > 2 && (
        <p className="text-center text-gray-500 text-xs">{t("View full history for more transactions")}</p>
      )}
    </div>
  );
};
