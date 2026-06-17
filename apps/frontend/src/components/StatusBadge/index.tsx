import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { TransactionStatus } from "@vortexfi/shared";
import { AnimatePresence, motion } from "motion/react";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";

interface StatusBadgeProps {
  status: TransactionStatus;
  explorerLink?: string;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status, explorerLink }) => {
  const [showExplorerLink, setShowExplorerLink] = useState(false);
  const { t } = useTranslation();
  const normalizedStatus = status.toLowerCase();

  const colors = {
    complete: "bg-success/10 text-success",
    failed: "bg-error/10 text-error",
    pending: "bg-warning/10 text-warning"
  } as const;

  const colorClass = colors[normalizedStatus as keyof typeof colors] || colors.pending;
  const showLink = showExplorerLink && !!explorerLink;

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
      <a
        href={explorerLink}
        onBlur={() => setShowExplorerLink(false)}
        onClick={e => e.stopPropagation()}
        onFocus={() => setShowExplorerLink(true)}
        onMouseEnter={() => setShowExplorerLink(true)}
        onMouseLeave={() => setShowExplorerLink(false)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {badgeContent}
      </a>
    );
  }

  return badgeContent;
};
