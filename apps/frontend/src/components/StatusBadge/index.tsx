import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { TransactionStatus } from "@vortexfi/shared";
import { AnimatePresence, motion } from "framer-motion";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";

interface StatusBadgeProps {
  status: TransactionStatus;
  explorerLink?: string;
  isHovered?: boolean;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status, explorerLink, isHovered = false }) => {
  const { t } = useTranslation();
  const normalizedStatus = status.toLowerCase();

  const colors = {
    complete: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800"
  } as const;

  const colorClass = colors[normalizedStatus as keyof typeof colors] || colors.pending;
  const showLink = isHovered && !!explorerLink;

  const badgeContent = (
    <motion.div
      className={cn(
        "relative flex items-center overflow-hidden rounded-full px-3 py-1 font-medium text-xs shadow-sm",
        colorClass
      )}
      layout
      style={{ originX: 1 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center whitespace-nowrap"
          exit={{ opacity: 0, y: -25 }}
          initial={{ opacity: 0, y: 25 }}
          key={showLink ? "explorer" : "status"}
          layout
          transition={{ bounce: 0, duration: 0.3, type: "spring" }}
        >
          {showLink ? (
            <>
              {t("menus.history.viewInExplorer")}
              <ArrowTopRightOnSquareIcon className="ml-1 h-3.5 w-3.5" />
            </>
          ) : (
            t(`menus.history.status.${normalizedStatus}`)
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
