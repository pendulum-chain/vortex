import React from "react";
import { cn } from "../../helpers/cn";
import { Step, StepConnectorProps } from "./types";

/**
 * Determines the styling classes for a connector line between steps
 */
const getConnectorStyles = (currentStepStatus: Step["status"], nextStepStatus: Step["status"]): string => {
  const baseStyles = "mx-2 min-w-5 h-0.5 bg-gray-300 flex-1 ";

  if (nextStepStatus === "complete" || (nextStepStatus === "active" && currentStepStatus === "complete")) {
    return cn(baseStyles, "bg-green-500");
  }

  if (currentStepStatus === "complete") {
    return cn(baseStyles, "bg-blue-500");
  }

  return cn(baseStyles, "bg-gray-300");
};

/**
 * Connector line component that appears between steps
 */
export const StepConnector: React.FC<StepConnectorProps> = ({ currentStepStatus, nextStepStatus }) => {
  const connectorStyles = getConnectorStyles(currentStepStatus, nextStepStatus);

  return <div className={connectorStyles} />;
};
