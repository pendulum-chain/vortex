import React from "react";
import { cn } from "../../helpers/cn";
import { Step, StepConnectorProps } from "./types";

const getConnectorLineStyles = (currentStepStatus: Step["status"], nextStepStatus: Step["status"]): string => {
  const baseStyles = "absolute h-px absolute top-[15px] right-[calc(-50%+20px)] left-[calc(50%+20px)] z-1";

  if (currentStepStatus === "complete") {
    if (nextStepStatus === "complete") {
      return cn(baseStyles, "bg-green-500");
    } else if (nextStepStatus === "active") {
      return cn(baseStyles, "bg-blue-500");
    } else {
      return cn(baseStyles, "bg-blue-500");
    }
  } else if (currentStepStatus === "active") {
    return cn(baseStyles, "bg-gray-300");
  } else {
    return cn(baseStyles, "bg-gray-300");
  }
};

export const StepConnector: React.FC<StepConnectorProps> = ({ currentStepStatus, nextStepStatus }) => {
  const lineStyles = getConnectorLineStyles(currentStepStatus, nextStepStatus);

  return (
    <div>
      <span className={lineStyles} />
    </div>
  );
};
