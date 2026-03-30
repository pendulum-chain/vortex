import { motion, useReducedMotion } from "motion/react";
import React from "react";
import { durations, easings } from "../../constants/animations";
import { Step, StepConnectorProps } from "./types";

const getConnectorColor = (currentStatus: Step["status"], nextStatus: Step["status"]): string => {
  const style = getComputedStyle(document.documentElement);
  if (currentStatus === "error") return style.getPropertyValue("--color-error").trim();
  if (currentStatus === "complete" && nextStatus === "complete") return style.getPropertyValue("--color-success").trim();
  if (currentStatus === "complete") return style.getPropertyValue("--color-primary").trim();
  return style.getPropertyValue("--color-base-300").trim();
};

export const StepConnector: React.FC<StepConnectorProps> = ({ currentStepStatus, nextStepStatus }) => {
  const backgroundColor = getConnectorColor(currentStepStatus, nextStepStatus);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute top-[15px] right-[calc(-50%+20px)] left-[calc(50%+20px)] z-1 h-px">
      <motion.div
        animate={{
          backgroundColor,
          width: currentStepStatus === "complete" || currentStepStatus === "error" ? "100%" : 0
        }}
        className="absolute z-10 h-px"
        initial={shouldReduceMotion ? false : { backgroundColor, width: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.slow * 1.5, ease: easings.easeOutCubic }}
      />
      <div className="absolute h-px w-full bg-gray-300" />
    </div>
  );
};
