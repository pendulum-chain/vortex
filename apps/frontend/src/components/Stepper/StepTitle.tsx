import React from "react";
import { Step } from "./types";

interface StepTitleProps {
  step: Step;
  status: Step["status"];
}

export const getStepTitleStyles = (status: Step["status"]): string => {
  const baseStyles = "mt-2 text-center text-xs leading-tight break-words";

  const statusStyles = {
    active: "font-medium text-blue-600",
    complete: "font-medium text-green-600",
    incomplete: "text-gray-500"
  };

  return `${baseStyles} ${statusStyles[status]}`;
};

export const StepTitle: React.FC<StepTitleProps> = ({ step, status }) => {
  const titleStyles = getStepTitleStyles(status);

  return (
    <div className="mx-auto flex w-22 items-start justify-center">
      <span className={titleStyles}>{step.title}</span>
    </div>
  );
};
