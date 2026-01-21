import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReactNode } from "react";
import { durations, easings } from "../../../../constants/animations";

interface SelectionDropdownMotionProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}

export const SelectionDropdownMotion = ({ isOpen, children, className }: SelectionDropdownMotionProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-150 ease-out ${className || ""}`}
      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              key="dropdown-content"
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      delay: isOpen ? durations.fast : 0,
                      duration: durations.fast,
                      ease: easings.easeOutCubic
                    }
              }
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
