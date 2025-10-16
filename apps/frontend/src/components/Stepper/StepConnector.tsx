import { motion } from "motion/react";
import React from "react";
import { Step, StepConnectorProps } from "./types";

const getConnectorColor = (currentStatus: Step["status"], nextStatus: Step["status"]): string => {
  if (currentStatus === "complete" && nextStatus === "complete") return "#22c55e";
  if (currentStatus === "complete") return "#3b82f6";
  return "#d1d5db";
};

export const StepConnector: React.FC<StepConnectorProps> = ({ currentStepStatus, nextStepStatus }) => {
  const backgroundColor = getConnectorColor(currentStepStatus, nextStepStatus);

  return (
    <div className="absolute top-[15px] right-[calc(-50%+20px)] left-[calc(50%+20px)] z-1 h-px">
      <motion.div
        animate={{
          backgroundColor,
          width: currentStepStatus === "complete" ? "100%" : 0
        }}
        className="absolute z-10 h-px"
        initial={{ backgroundColor, width: 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
      <div className="absolute h-px w-full bg-gray-300" />
    </div>
  );
};
