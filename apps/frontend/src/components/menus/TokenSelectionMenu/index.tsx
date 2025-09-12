import { AnimatePresence, motion } from "motion/react";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { useTokenSelectionActions, useTokenSelectionState } from "../../../stores/tokenSelectionStore";
import { Skeleton } from "../../Skeleton";
import { TokenSelectionList } from "../../TokenSelection/TokenSelectionList";

export function TokenSelectionMenu() {
  const { isOpen, isLoading } = useTokenSelectionState();
  const { closeTokenSelectModal } = useTokenSelectionActions();
  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

  useEscapeKey(isOpen, closeTokenSelectModal);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          animate={{ x: 0 }}
          className="absolute inset-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg"
          exit={{ x: "-100%" }}
          initial={{ x: "-100%" }}
          transition={{ duration: 0.5 }}
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingContent() {
  return <Skeleton className="mb-2 h-10 w-full" />;
}
