import { motion } from "motion/react";
import { ReactNode } from "react";

interface SelectionButtonMotionProps {
  isExpanded: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}

export const SelectionButtonMotion = ({ isExpanded, children, onClick, className }: SelectionButtonMotionProps) => {
  return (
    <motion.button
      animate={{
        width: isExpanded ? "100%" : "10%"
      }}
      className={className}
      onClick={onClick}
      transition={{
        delay: isExpanded ? 0 : 0.25,
        duration: 0.15,
        ease: "easeOut"
      }}
      whileHover={{ scale: 1.01 }}
    >
      {children}
    </motion.button>
  );
};
