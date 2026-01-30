import { motion, useReducedMotion } from "motion/react";
import React from "react";
import { durations, easings } from "../../constants/animations";
import { Step, StepConnectorProps } from "./types";

const getConnectorColor = (currentStatus: Step["status"], nextStatus: Step["status"]): string => {
  if (currentStatus === "error") return "#f87171";
  if (currentStatus === "complete" && nextStatus === "complete") return "#22c55e";
  if (currentStatus === "complete") return "#3b82f6";
  return "#d1d5db";
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
