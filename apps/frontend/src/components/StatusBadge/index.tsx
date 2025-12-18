import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { FC } from "react";
import { TransactionStatus } from "../menus/HistoryMenu/types";

interface StatusBadgeProps {
  status: TransactionStatus;
  explorerLink?: string;
  isHovered?: boolean;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status, explorerLink, isHovered = false }) => {
  const normalizedStatus = status.toLowerCase();

  const colors = {
    complete: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800"
  } as const;

  const colorClass = colors[normalizedStatus as keyof typeof colors] || colors.pending;
  const showLink = isHovered && !!explorerLink;

  const badgeContent = (
    <LayoutGroup>
      <motion.div
        className={`relative flex items-center rounded-full px-3 py-1 font-medium text-xs shadow-sm ${colorClass}`}
        layout
        style={{ originX: 1 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center whitespace-nowrap"
            exit={{ opacity: 0, y: -5 }}
            initial={{ opacity: 0, y: 5 }}
            key={showLink ? "explorer" : "status"}
            layout
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {showLink ? (
              <>
                View in explorer
                <ArrowTopRightOnSquareIcon className="ml-1 h-3.5 w-3.5" />
              </>
            ) : (
              normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)
            )}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
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
