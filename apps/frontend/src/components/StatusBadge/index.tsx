import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { AnimatePresence, motion } from "framer-motion";
import { FC } from "react";
import { TransactionStatus } from "../menus/HistoryMenu/types";

interface StatusBadgeProps {
  status: TransactionStatus;
  explorerLink?: string;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status, explorerLink }) => {
  const normalizedStatus = status.toLowerCase();

  const colors = {
    complete: {
      bg: "bg-green-100",
      hoverBg: "bg-green-600",
      hoverText: "text-white",
      text: "text-green-800"
    },
    failed: {
      bg: "bg-red-100",
      hoverBg: "bg-red-600",
      hoverText: "text-white",
      text: "text-red-800"
    },
    pending: {
      bg: "bg-yellow-100",
      hoverBg: "bg-yellow-600",
      hoverText: "text-white",
      text: "text-yellow-800"
    }
  } as const;

  const colorConfig = colors[normalizedStatus as keyof typeof colors] || colors.pending;

  const badgeContent = (
    <motion.div
      className={`flex items-center rounded-full px-3 py-1 font-medium text-xs transition-colors duration-200 ${colorConfig.bg} ${colorConfig.text} ${
        explorerLink ? `group-hover:${colorConfig.hoverBg} group-hover:${colorConfig.hoverText}` : ""
      }`}
      layout
      style={{ originX: 1 }}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center whitespace-nowrap"
          exit={{ opacity: 0, y: -10 }}
          initial={{ opacity: 0, y: 10 }}
          key={explorerLink ? "hover-text" : "status-text"}
          transition={{ duration: 0.2 }}
        >
          {/* We show "View in explorer" only on hover if link exists, but the span key logic handles the swap */}
          <span className={explorerLink ? "group-hover:hidden" : ""}>
            {normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)}
          </span>
          {explorerLink && (
            <span className="hidden items-center group-hover:flex">
              View in explorer
              <ArrowTopRightOnSquareIcon className="ml-1 h-3.5 w-3.5" />
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );

  if (explorerLink) {
    return (
      <a href={explorerLink} onClick={e => e.stopPropagation()} rel="noopener noreferrer" target="_blank">
        {badgeContent}
      </a>
    );
  }

  return badgeContent;
};
