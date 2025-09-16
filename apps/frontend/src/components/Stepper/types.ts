export interface Step {
  title: string;
  status: "complete" | "active" | "incomplete";
  Icon: React.ElementType;
}

export interface StepperProps {
  steps: Step[];
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export interface StepItemProps {
  step: Step;
  index: number;
  isLast: boolean;
  onStepClick?: (stepIndex: number) => void;
  nextStepStatus?: Step["status"];
}

export interface StepCircleProps {
  status: Step["status"];
  step: Step;
  isClickable: boolean;
  onClick: () => void;
}

export interface StepConnectorProps {
  currentStepStatus: Step["status"];
  nextStepStatus: Step["status"];
}

export interface CheckIconProps {
  className?: string;
}
