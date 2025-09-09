import React from "react";

export interface Step {
  icon?: string;
  title: string;
  status: "complete" | "active" | "incomplete";
}

export interface StepperProps {
  steps: Step[];
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, onStepClick, className = "" }) => {
  const handleStepClick = (stepIndex: number) => {
    if (onStepClick) {
      onStepClick(stepIndex);
    }
  };

  return (
    <div className={`flex w-full items-center justify-between ${className}`}>
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          {/* Step Circle */}
          <div className="flex flex-col items-center">
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm transition-all duration-200 ease-in-out ${
                step.status === "complete"
                  ? "bg-green-500 text-white"
                  : step.status === "active"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-300 text-gray-600"
              } ${
                onStepClick && step.status !== "incomplete"
                  ? "cursor-pointer hover:scale-110"
                  : onStepClick
                    ? "cursor-not-allowed"
                    : "cursor-default"
              } `}
              disabled={!onStepClick}
              onClick={() => handleStepClick(index)}
            >
              {step.status === "complete" ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path
                    clipRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    fillRule="evenodd"
                  />
                </svg>
              ) : (
                <span>{step.icon ? <img alt={step.title} className="h-5 w-5" src={step.icon} /> : index + 1}</span>
              )}
            </button>
            {/* Step Title */}
            <span
              className={`mt-2 max-w-20 text-center text-xs ${
                step.status === "active"
                  ? "font-medium text-blue-600"
                  : step.status === "complete"
                    ? "font-medium text-green-600"
                    : "text-gray-500"
              } `}
            >
              {step.title}
            </span>
          </div>
          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div
              className={`mx-2 h-0.5 flex-1 ${
                steps[index + 1].status === "complete" || (steps[index + 1].status === "active" && step.status === "complete")
                  ? "bg-green-500"
                  : step.status === "complete"
                    ? "bg-blue-500"
                    : "bg-gray-300"
              } `}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Stepper;
