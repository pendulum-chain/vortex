import React from "react";

interface StepperGridProps {
  stepCount: number;
  className?: string;
  children: React.ReactNode;
}

export const StepperGrid: React.FC<StepperGridProps> = ({ stepCount, className = "", children }) => {
  return (
    <div
      className={`grid w-full ${className} relative`}
      style={{
        gridTemplateColumns: `repeat(${stepCount}, 1fr)`,
        gridTemplateRows: "auto auto"
      }}
    >
      {children}
    </div>
  );
};
