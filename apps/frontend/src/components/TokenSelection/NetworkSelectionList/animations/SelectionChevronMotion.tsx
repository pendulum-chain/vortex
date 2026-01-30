import { motion, useReducedMotion } from "motion/react";
import { ReactNode } from "react";
import { durations, easings } from "../../../../constants/animations";

interface SelectionChevronMotionProps {
  isOpen: boolean;
  children: ReactNode;
}

export const SelectionChevronMotion = ({ isOpen, children }: SelectionChevronMotionProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ rotate: isOpen ? 180 : 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.normal, ease: easings.easeOutCubic }}
    >
      {children}
    </motion.div>
  );
};
