import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "../../components/Skeleton";
import { TokenSelectionList } from "../../components/TokenSelection/TokenSelectionList";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useTokenModalActions, useTokenModalState } from "../../stores/rampModalStore";

export function TokenSelectionPage() {
  const { isOpen, isLoading } = useTokenModalState();
  const { closeTokenSelectModal } = useTokenModalActions();
  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

  useEscapeKey(isOpen, closeTokenSelectModal);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          animate={{ x: 0 }}
          className="absolute top-0 right-0 bottom-0 left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg"
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
