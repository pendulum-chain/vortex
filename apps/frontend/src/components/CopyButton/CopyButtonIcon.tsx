import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { FC } from "react";
import { CopyIcon } from "../../assets/CopyIcon";

interface CopyButtonIconProps {
  copied: boolean;
  className?: string;
  onAnimationComplete?: () => void;
}

const animationProps = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1.1 },
  transition: { duration: 0.1 }
};

const copyIconProps = {
  ...animationProps,
  exit: { filter: "blur(10px)", scale: 0.6 },
  initial: { filter: "blur(10px)", scale: 1 }
};

const checkIconProps = {
  animate: {
    filter: ["blur(10px)", "blur(0px)", "blur(0px)", "blur(10px)"],
    opacity: [0, 1, 1, 0],
    scale: [0.75, 1.1, 1.1, 0.75],
    transition: {
      duration: 0.8,
      times: [0, 0.125, 0.875, 1]
    }
  },
  initial: { filter: "blur(10px)", opacity: 0, scale: 0.75 }
};

export const CopyButtonIcon: FC<CopyButtonIconProps> = ({ copied, className = "h-4 w-4", onAnimationComplete }) => {
  return (
    <span className={`flex items-center justify-center ${className}`}>
      <AnimatePresence initial={false} mode="wait">
        {!copied ? (
          <motion.div key="copy" {...copyIconProps}>
            <CopyIcon className="h-4 w-4" />
          </motion.div>
        ) : (
          <motion.span key="check" {...checkIconProps} onAnimationComplete={onAnimationComplete}>
            <CheckCircleIcon className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
