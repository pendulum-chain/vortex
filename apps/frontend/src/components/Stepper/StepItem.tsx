import React from "react";
import { StepCircle } from "./StepCircle";
import { StepConnector } from "./StepConnector";
import { Step, StepItemProps } from "./types";

/**
 * Determines the styling classes for a step title based on its status
 */
export const getStepTitleStyles = (status: Step["status"]): string => {
  const baseStyles = "mt-2 max-w-20 text-center text-xs";

  const statusStyles = {
    active: "font-medium text-blue-600",
    complete: "font-medium text-green-600",
    incomplete: "text-gray-500"
  };

  return `${baseStyles} ${statusStyles[status]}`;
};

/**
 * Determines if a step should be clickable based on its status and whether click handler exists
 */
export const isStepClickable = (status: Step["status"], hasClickHandler: boolean): boolean => {
  return hasClickHandler && status !== "incomplete";
};

/**
 * Individual step item component that includes circle, title, and optional connector
 */
export const StepItem: React.FC<StepItemProps> = ({ step, index, isLast, onStepClick, nextStepStatus }) => {
  const titleStyles = getStepTitleStyles(step.status);
  const clickable = isStepClickable(step.status, Boolean(onStepClick));

  const handleClick = () => {
    if (onStepClick && clickable) {
      onStepClick(index);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center">
        <StepCircle index={index} isClickable={clickable} onClick={handleClick} status={step.status} />
        <span className={titleStyles}>{step.title}</span>
      </div>
      {!isLast && nextStepStatus && <StepConnector currentStepStatus={step.status} nextStepStatus={nextStepStatus} />}
    </>
  );
};
