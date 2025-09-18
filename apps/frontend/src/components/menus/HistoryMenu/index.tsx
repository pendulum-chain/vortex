import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRampHistory } from "../../../hooks/useRampHistory";
import { useRampHistoryStore } from "../../../stores/rampHistoryStore";
import { Menu, MenuAnimationDirection } from "../Menu";
import { groupRampHistoryByMonth } from "./helpers";
import { TransactionItem } from "./TransactionItem";
import { TransactionGroup } from "./types";

export function HistoryMenu() {
  const { isActive, actions } = useRampHistoryStore();
  const { data, isLoading, refetch } = useRampHistory();

  const { t } = useTranslation();

  useEffect(() => {
    if (isActive) {
      refetch();
    }
  }, [isActive, refetch]);

  const rampHistoryGroups: TransactionGroup[] = data?.transactions ? groupRampHistoryByMonth(data.transactions) : [];

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-gray-900 border-b-2"></div>
        </div>
      );
    }

    if (rampHistoryGroups.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-gray-500">{t("menus.history.noHistory")}</p>
        </div>
      );
    }

    return rampHistoryGroups.map(group => (
      <div className="mb-6" key={group.month}>
        <h2 className="mb-2 font-semibold text-gray-700 text-lg">{group.month}</h2>
        {group.transactions.map(transaction => (
          <TransactionItem key={transaction.id} transaction={transaction} />
        ))}
      </div>
    ));
  };

  return (
    <Menu
      animationDirection={MenuAnimationDirection.RIGHT}
      isOpen={isActive}
      onClose={actions.toggleHistory}
      title={t("menus.history.title")}
    >
      {renderContent()}
    </Menu>
  );
}
