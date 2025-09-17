import React from "react";
import { StepCircle } from "./StepCircle";
import { StepConnector } from "./StepConnector";
import { Step, StepperProps } from "./types";

/**
 * Determines the styling classes for a step title based on its status
 */
export const getStepTitleStyles = (status: Step["status"]): string => {
  const baseStyles = "mt-2 text-center text-xs leading-tight break-words";

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

export const Stepper: React.FC<StepperProps> = ({ steps, onStepClick, className = "" }) => (
  <div
    className={`grid w-full ${className} relative`}
    style={{
      gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
      gridTemplateRows: "auto auto"
    }}
  >
    {steps.map((step, index) => {
      const clickable = isStepClickable(step.status, Boolean(onStepClick));
      const handleClick = () => {
        if (onStepClick && clickable) {
          onStepClick(index);
        }
      };

      return (
        <div
          className="flex items-center justify-center pb-2"
          key={`circle-${index}`}
          style={{ gridColumn: index + 1, gridRow: 1 }}
        >
          <StepCircle isClickable={clickable} onClick={handleClick} status={step.status} step={step} />
        </div>
      );
    })}

    {steps.map((step, index) => {
      const titleStyles = getStepTitleStyles(step.status);

      return (
        <div
          className="mx-auto flex w-22 items-start justify-center"
          key={`title-${index}`}
          style={{ gridColumn: index + 1, gridRow: 2 }}
        >
          <span className={titleStyles}>{step.title}</span>
        </div>
      );
    })}

    {steps.map((step, index) => {
      if (index === steps.length - 1) return null;

      return (
        <div
          className="-left-[17px] pointer-events-none absolute top-[15px]"
          key={`connector-${index}`}
          style={{
            gridColumn: `${index + 2} / ${index + 3}`
          }}
        >
          <StepConnector currentStepStatus={step.status} nextStepStatus={steps[index + 1].status} />
        </div>
      );
    })}
  </div>
);
