import { motion, useReducedMotion } from "motion/react";
import { ReactNode } from "react";
import { durations, easings } from "../../../../constants/animations";

interface SelectionButtonMotionProps {
  isExpanded: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}

export const SelectionButtonMotion = ({ isExpanded, children, onClick, className }: SelectionButtonMotionProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      animate={{
        width: isExpanded ? "100%" : "10%"
      }}
      className={className}
      onClick={onClick}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              delay: isExpanded ? 0 : 0.25,
              duration: durations.fast,
              ease: easings.easeOutCubic
            }
      }
      whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
    >
      {children}
    </motion.button>
  );
};
