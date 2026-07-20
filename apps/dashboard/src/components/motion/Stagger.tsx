import { type HTMLMotionProps, motion } from "motion/react";
import { riseItem, staggerList } from "@/lib/motion";

/** Wrap a group of `<StaggerItem>`s to reveal them in a cascade on mount. */
export function Stagger({ children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div animate="show" initial="hidden" variants={staggerList} {...props}>
      {children}
    </motion.div>
  );
}

/** A single member of a `<Stagger>` cascade. Spread `whileHover`/`whileTap` for extra interactivity. */
export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={riseItem} {...props}>
      {children}
    </motion.div>
  );
}
