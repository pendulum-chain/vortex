import { AnimatePresence, motion } from "motion/react";
import { ReactNode } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { PageHeader } from "../PageHeader";

export enum MenuAnimationDirection {
  RIGHT = "RIGHT",
  LEFT = "LEFT",
  TOP = "TOP",
  BOTTOM = "BOTTOM"
}

export interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  animationDirection: MenuAnimationDirection;
}

export function Menu({ isOpen, onClose, title, children, animationDirection }: MenuProps) {
  useEscapeKey(isOpen, onClose);

  const animationProps =
    animationDirection === MenuAnimationDirection.RIGHT
      ? {
          animate: { x: 0 },
          exit: { x: "100%" },
          initial: { x: "100%" }
        }
      : {
          animate: { y: 0 },
          exit: { y: "-100%" },
          initial: { y: "-100%" }
        };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.section
          animate={animationProps.animate}
          className="absolute top-0 right-0 bottom-0 left-0 z-40 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg"
          exit={animationProps.exit}
          initial={animationProps.initial}
          transition={{ duration: 0.5 }}
        >
          <PageHeader onClose={onClose} title={title} />
          <hr />
          <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
