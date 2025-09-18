import React from "react";
import { StepItem } from "./StepItem";
import { StepperGrid } from "./StepperGrid";
import { StepperProps } from "./types";

export const Stepper: React.FC<StepperProps> = ({ steps, onStepClick, className = "" }) => (
  <StepperGrid className={className} stepCount={steps.length}>
    {steps.map((step, index) => (
      <StepItem
        index={index}
        isLast={index === steps.length - 1}
        key={`step-${index}`}
        nextStepStatus={index < steps.length - 1 ? steps[index + 1].status : undefined}
        onStepClick={onStepClick}
        step={step}
      />
    ))}
  </StepperGrid>
);
