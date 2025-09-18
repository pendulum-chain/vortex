import { FC } from "react";
import { TransactionStatus } from "../menus/HistoryMenu/types";

export const StatusBadge: FC<{ status: TransactionStatus }> = ({ status }) => {
  const colors = {
    failed: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    success: "bg-green-100 text-green-800"
  };

  return (
    <span className={`rounded-full px-2 py-1 font-medium text-xs ${colors[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};
