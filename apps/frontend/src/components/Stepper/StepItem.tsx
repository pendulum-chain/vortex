import React from "react";
import { StepCircle } from "./StepCircle";
import { StepConnector } from "./StepConnector";
import { StepTitle } from "./StepTitle";
import { StepItemProps } from "./types";

export const isStepClickable = (status: StepItemProps["step"]["status"], hasClickHandler: boolean): boolean => {
  return hasClickHandler && status !== "incomplete";
};

export const StepItem: React.FC<StepItemProps> = ({ step, index, isLast, onStepClick, nextStepStatus }) => {
  const clickable = isStepClickable(step.status, Boolean(onStepClick));

  const handleClick = () => {
    if (onStepClick && clickable) {
      onStepClick(index);
    }
  };

  return (
    <>
      <div className="relative flex items-center justify-center pb-2" style={{ gridColumn: index + 1, gridRow: 1 }}>
        <StepCircle isClickable={clickable} onClick={handleClick} status={step.status} step={step} />
        {!isLast && nextStepStatus && <StepConnector currentStepStatus={step.status} nextStepStatus={nextStepStatus} />}
      </div>
      <div style={{ gridColumn: index + 1, gridRow: 2 }}>
        <StepTitle status={step.status} step={step} />
      </div>
    </>
  );
};
