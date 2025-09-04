import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Step, Stepper, StepperProps } from "../components/Stepper";

interface StoryArgs extends StepperProps {
  stepCount?: number;
  currentStep?: number;
  allComplete?: boolean;
  allIncomplete?: boolean;
  longTitles?: boolean;
}

const generateSteps = (
  count: number,
  currentStep = 0,
  allComplete = false,
  allIncomplete = false,
  longTitles = false
): Step[] => {
  const shortTitles = ["Setup", "Details", "Review", "Payment", "Complete"];
  const longTitles_array = [
    "Initial Setup & Configuration",
    "Personal Details & Information",
    "Review & Verification",
    "Payment & Processing",
    "Completion & Confirmation"
  ];

  const titles = longTitles ? longTitles_array : shortTitles;

  return Array.from({ length: count }, (_, index) => {
    let status: Step["status"];

    if (allComplete) {
      status = "complete";
    } else if (allIncomplete) {
      status = "incomplete";
    } else {
      if (index < currentStep) {
        status = "complete";
      } else if (index === currentStep) {
        status = "active";
      } else {
        status = "incomplete";
      }
    }

    return {
      status,
      title: titles[index] || `Step ${index + 1}`
    };
  });
};

const StepperWrapper = (args: StoryArgs) => {
  const steps =
    args.steps ||
    generateSteps(
      args.stepCount || 3,
      args.currentStep || 1,
      args.allComplete || false,
      args.allIncomplete || false,
      args.longTitles || false
    );

  return <Stepper className={args.className} onStepClick={args.onStepClick} steps={steps} />;
};

const FormWizardDemo = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    address: "",
    email: "",
    name: "",
    payment: ""
  });

  const steps: Step[] = [
    { status: currentStep > 0 ? "complete" : currentStep === 0 ? "active" : "incomplete", title: "Personal Info" },
    { status: currentStep > 1 ? "complete" : currentStep === 1 ? "active" : "incomplete", title: "Address" },
    { status: currentStep > 2 ? "complete" : currentStep === 2 ? "active" : "incomplete", title: "Payment" },
    { status: currentStep > 3 ? "complete" : currentStep === 3 ? "active" : "incomplete", title: "Confirmation" }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Allow navigation to any completed step
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Personal Information</h3>
            <input
              className="w-full rounded border p-2"
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full Name"
              value={formData.name}
            />
            <input
              className="w-full rounded border p-2"
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="Email Address"
              type="email"
              value={formData.email}
            />
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Address Information</h3>
            <textarea
              className="w-full rounded border p-2"
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full Address"
              rows={3}
              value={formData.address}
            />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Payment Method</h3>
            <select
              className="w-full rounded border p-2"
              onChange={e => setFormData({ ...formData, payment: e.target.value })}
              value={formData.payment}
            >
              <option value="">Select Payment Method</option>
              <option value="credit">Credit Card</option>
              <option value="debit">Debit Card</option>
              <option value="crypto">Cryptocurrency</option>
            </select>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Confirmation</h3>
            <div className="rounded bg-gray-50 p-4">
              <p>
                <strong>Name:</strong> {formData.name || "Not provided"}
              </p>
              <p>
                <strong>Email:</strong> {formData.email || "Not provided"}
              </p>
              <p>
                <strong>Address:</strong> {formData.address || "Not provided"}
              </p>
              <p>
                <strong>Payment:</strong> {formData.payment || "Not selected"}
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      <Stepper onStepClick={handleStepClick} steps={steps} />

      <div className="min-h-48 rounded border p-6">{renderStepContent()}</div>

      <div className="flex justify-between">
        <button
          className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
          disabled={currentStep === 0}
          onClick={handlePrevious}
        >
          Previous
        </button>
        <button
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={currentStep === steps.length - 1}
          onClick={handleNext}
        >
          {currentStep === steps.length - 1 ? "Complete" : "Next"}
        </button>
      </div>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    allComplete: {
      control: "boolean",
      description: "Make all steps complete (story helper)"
    },
    allIncomplete: {
      control: "boolean",
      description: "Make all steps incomplete (story helper)"
    },
    currentStep: {
      control: { max: 5, min: 0, step: 1, type: "range" },
      description: "Current active step index (story helper)"
    },
    longTitles: {
      control: "boolean",
      description: "Use longer step titles (story helper)"
    },
    stepCount: {
      control: { max: 5, min: 2, step: 1, type: "range" },
      description: "Number of steps to generate (story helper)"
    }
  },
  component: StepperWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A customizable stepper component for displaying multi-step processes with visual progress indicators. Supports interactive navigation and various visual states."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Stepper"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    currentStep: 1,
    stepCount: 3
  },
  render: StepperWrapper
};

export const SingleStep: Story = {
  args: {
    steps: [{ status: "active", title: "Only Step" }]
  },
  render: StepperWrapper
};

export const TwoSteps: Story = {
  args: {
    currentStep: 0,
    stepCount: 2
  },
  render: StepperWrapper
};

export const AllComplete: Story = {
  args: {
    allComplete: true,
    stepCount: 5
  },
  render: StepperWrapper
};

export const AllIncomplete: Story = {
  args: {
    allIncomplete: true,
    stepCount: 5
  },
  render: StepperWrapper
};

export const LastStep: Story = {
  args: {
    currentStep: 3,
    stepCount: 4
  },
  render: StepperWrapper
};

export const LongTitles: Story = {
  args: {
    currentStep: 1,
    longTitles: true,
    stepCount: 4
  },
  render: StepperWrapper
};

export const FormWizard: Story = {
  parameters: {
    docs: {
      description: {
        story: "Complete form wizard example demonstrating real-world usage with step content and navigation."
      }
    }
  },
  render: FormWizardDemo
};

export const NonClickable: Story = {
  args: {
    currentStep: 2,
    onStepClick: undefined,
    stepCount: 4
  },
  parameters: {
    docs: {
      description: {
        story: "Stepper without click handlers - purely visual progress indicator."
      }
    }
  },
  render: StepperWrapper
};
