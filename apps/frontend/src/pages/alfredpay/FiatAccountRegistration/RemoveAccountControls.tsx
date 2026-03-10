import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { AnimatedRemoveFiatAccountLabel } from "../../../components/AnimatedRemoveFiatAccountLabel";
import { HoldButton } from "../../../components/HoldButton";
import { durations } from "../../../constants/animations";

export function RemoveAccountControls({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex items-center justify-end gap-2">
      <AnimatePresence mode="popLayout">
        {confirming && (
          <motion.div
            animate={{ scale: 1, y: 0 }}
            className="flex-1"
            exit={{ scale: 0.9, y: 4 }}
            initial={shouldReduceMotion ? false : { scale: 0.9, y: 4 }}
            key="hold-to-remove"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.micro, ease: "easeOut" }}
          >
            <HoldButton
              className="h-auto touch-manipulation bg-red-100 py-2.5 text-red-800 text-xs [@media(hover:hover)]:hover:bg-red-200"
              holdClassName="bg-red-300 text-red-800"
              onComplete={onDelete}
            >
              Hold to remove
            </HoldButton>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        aria-expanded={confirming}
        aria-label={confirming ? "Cancel account removal" : "Remove this account"}
        className={
          "relative w-[80px] cursor-pointer touch-manipulation overflow-hidden rounded-lg bg-gray-100 py-2.5 text-center text-gray-500 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:scale-[0.97] [@media(hover:hover)]:hover:bg-gray-200 [@media(hover:hover)]:hover:text-gray-800"
        }
        onClick={() => setConfirming(state => !state)}
        type="button"
      >
        <AnimatedRemoveFiatAccountLabel motionKey={confirming ? "close" : "remove"}>
          {confirming ? "Close" : "Remove"}
        </AnimatedRemoveFiatAccountLabel>
      </button>
    </div>
  );
}
