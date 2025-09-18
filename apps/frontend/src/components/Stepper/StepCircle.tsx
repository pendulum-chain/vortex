import React from "react";
import { CheckIcon } from "./CheckIcon";
import { Step, StepCircleProps } from "./types";

export const getStepCircleStyles = (status: Step["status"], isClickable: boolean): string => {
  const baseStyles =
    "flex h-8 w-8 items-center mx-auto justify-center rounded-full font-medium text-sm transition-all duration-200 ease-in-out hover:scale-110";

  const statusStyles = {
    active: "bg-blue-500 text-white",
    complete: "bg-green-500 text-white",
    incomplete: "bg-gray-300 text-gray-600"
  };

  const interactionStyles = isClickable
    ? "cursor-pointer hover:scale-110"
    : status === "incomplete"
      ? "cursor-not-allowed"
      : "cursor-default";

  return `${baseStyles} ${statusStyles[status]} ${interactionStyles}`;
};

export const StepCircle: React.FC<StepCircleProps> = ({ status, isClickable, onClick, step }) => {
  const circleStyles = getStepCircleStyles(status, isClickable);

  return (
    <button className={circleStyles} disabled={!isClickable} onClick={onClick} type="button">
      {status === "complete" ? <CheckIcon /> : <step.Icon className="h-5 w-5" />}
    </button>
  );
};
