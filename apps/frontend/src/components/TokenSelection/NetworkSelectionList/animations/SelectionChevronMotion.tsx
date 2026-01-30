import { motion } from "motion/react";
import { ReactNode } from "react";

interface SelectionChevronMotionProps {
  isOpen: boolean;
  children: ReactNode;
}

export const SelectionChevronMotion = ({ isOpen, children }: SelectionChevronMotionProps) => {
  return (
    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
};
