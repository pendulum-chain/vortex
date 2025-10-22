import { AnimatePresence, motion } from "motion/react";
import { ReactNode } from "react";

interface SelectionDropdownMotionProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}

export const SelectionDropdownMotion = ({ isOpen, children, className }: SelectionDropdownMotionProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          animate={{
            height: "auto",
            transition: {
              damping: 50,
              delay: 0.15,
              duration: 0.15,
              ease: "easeOut",
              stiffness: 600,
              type: "spring"
            }
          }}
          className={className}
          exit={{
            height: 0,
            transition: {
              damping: 50,
              delay: 0,
              duration: 0.15,
              ease: "easeOut",
              stiffness: 600,
              type: "spring"
            }
          }}
          initial={{ height: 0 }}
          key="dropdown-content"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
