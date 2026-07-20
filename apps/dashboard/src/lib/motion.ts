import type { Transition, Variants } from "motion/react";

/** House spring — bounce is always 0 so motion feels quick and composed, never springy/playful-to-a-fault. */
export const spring: Transition = { bounce: 0, duration: 0.4, type: "spring" };
export const springSnappy: Transition = { bounce: 0, duration: 0.3, type: "spring" };

/** A single element rising into place. Pairs with `staggerList` on a parent for a cascade. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, transition: spring, y: 0 }
};

/** Parent orchestrator: children using `riseItem` cascade in one after another. */
export const staggerList: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.04, staggerChildren: 0.06 } }
};

/** An icon/badge popping in — used for empty-state and confirmation glyphs. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { ...springSnappy, bounce: 0.35 } }
};
