import React from "react";
import { Step, StepConnectorProps } from "./types";

/**
 * Determines the styling classes for a connector line between steps
 */
const getConnectorStyles = (currentStepStatus: Step["status"], nextStepStatus: Step["status"]): string => {
  const baseStyles = "mx-2 h-0.5 flex-1";

  // Connector is green if next step is complete or if next step is active and current is complete
  if (nextStepStatus === "complete" || (nextStepStatus === "active" && currentStepStatus === "complete")) {
    return `${baseStyles} bg-green-500`;
  }

  // Connector is blue if current step is complete
  if (currentStepStatus === "complete") {
    return `${baseStyles} bg-blue-500`;
  }

  // Default gray connector
  return `${baseStyles} bg-gray-300`;
};

/**
 * Connector line component that appears between steps
 */
export const StepConnector: React.FC<StepConnectorProps> = ({ currentStepStatus, nextStepStatus }) => {
  const connectorStyles = getConnectorStyles(currentStepStatus, nextStepStatus);

  return <div className={connectorStyles} />;
};
