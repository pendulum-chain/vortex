import React from "react";
import { StepCircle } from "./StepCircle";
import { StepConnector } from "./StepConnector";
import { getStepTitleStyles, isStepClickable } from "./StepItem";
import { StepperProps } from "./types";

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
