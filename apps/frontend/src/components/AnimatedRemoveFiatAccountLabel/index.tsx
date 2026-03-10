import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { durations } from "../../constants/animations";

interface AnimatedLabelProps {
  children: React.ReactNode;
  motionKey: string;
}

export function AnimatedRemoveFiatAccountLabel({ children, motionKey }: AnimatedLabelProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.p
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -25 }}
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 25 }}
        key={motionKey}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.micro, ease: "easeOut" }}
      >
        {children}
      </motion.p>
    </AnimatePresence>
  );
}
