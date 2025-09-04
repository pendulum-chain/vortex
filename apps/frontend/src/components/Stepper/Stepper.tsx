import React from "react";
import { StepItem } from "./StepItem";
import { StepperProps } from "./types";

export const Stepper: React.FC<StepperProps> = ({ steps, onStepClick, className = "" }) => (
  <div className={`flex w-full items-center justify-between ${className}`}>
    {steps.map((step, index) => (
      <StepItem
        index={index}
        isLast={index === steps.length - 1}
        key={index}
        nextStepStatus={index < steps.length - 1 ? steps[index + 1].status : undefined}
        onStepClick={onStepClick}
        step={step}
      />
    ))}
  </div>
);
