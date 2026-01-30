import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TermsAndConditions } from "../components/TermsAndConditions";

interface StoryArgs {
  termsChecked?: boolean;
  termsAccepted?: boolean;
  termsError?: boolean;
}

const TermsAndConditionsWrapper = ({ termsChecked = false, termsAccepted = false, termsError = false }: StoryArgs) => {
  const [checked, setChecked] = useState(termsChecked);
  const [error, setError] = useState(termsError);
  const [accepted, setAccepted] = useState(termsAccepted);

  return (
    <div className="w-full max-w-md">
      <TermsAndConditions
        setTermsError={setError}
        termsAccepted={accepted}
        termsChecked={checked}
        termsError={error}
        toggleTermsChecked={() => setChecked(!checked)}
      />
      {!accepted && (
        <div className="mt-4 flex gap-2">
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={!checked}
            onClick={() => setAccepted(true)}
          >
            Accept & Continue
          </button>
          {!checked && (
            <button className="rounded bg-red-100 px-4 py-2 text-red-800" onClick={() => setError(true)}>
              Trigger Error
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const InteractiveDemo = () => {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleContinue = () => {
    if (!checked) {
      setError(true);
      return;
    }
    setAccepted(true);
  };

  const handleReset = () => {
    setChecked(false);
    setError(false);
    setAccepted(false);
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">
          State: {accepted ? "Accepted" : checked ? "Checked" : error ? "Error" : "Unchecked"}
        </p>
      </div>

      <TermsAndConditions
        setTermsError={setError}
        termsAccepted={accepted}
        termsChecked={checked}
        termsError={error}
        toggleTermsChecked={() => {
          setChecked(!checked);
          setError(false);
        }}
      />

      {accepted ? (
        <div className="rounded bg-green-100 p-4 text-center">
          <p className="font-semibold text-green-800">Terms Accepted!</p>
          <button className="mt-2 text-green-600 text-sm underline" onClick={handleReset}>
            Reset Demo
          </button>
        </div>
      ) : (
        <button className="w-full rounded bg-blue-600 py-3 font-semibold text-white" onClick={handleContinue}>
          Continue
        </button>
      )}
    </div>
  );
};

const CheckoutFlowDemo = () => {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-lg">
      <h2 className="font-bold text-xl">Complete Your Order</h2>

      <div className="space-y-3 rounded bg-gray-50 p-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Amount</span>
          <span className="font-medium">100 USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Fee</span>
          <span className="font-medium">0.50 USDC</span>
        </div>
        <div className="flex justify-between border-t pt-3">
          <span className="font-semibold">Total</span>
          <span className="font-semibold">100.50 USDC</span>
        </div>
      </div>

      <TermsAndConditions
        setTermsError={setError}
        termsAccepted={accepted}
        termsChecked={checked}
        termsError={error}
        toggleTermsChecked={() => {
          setChecked(!checked);
          setError(false);
        }}
      />

      {accepted ? (
        <div className="rounded bg-green-100 p-4 text-center">
          <p className="font-semibold text-green-800">Order Confirmed!</p>
        </div>
      ) : (
        <button
          className="w-full rounded bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
          onClick={() => {
            if (!checked) {
              setError(true);
              return;
            }
            setAccepted(true);
          }}
        >
          Confirm Order
        </button>
      )}
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    termsAccepted: {
      control: "boolean",
      description: "Whether the terms have been accepted (hides the checkbox)"
    },
    termsChecked: {
      control: "boolean",
      description: "Whether the checkbox is checked"
    },
    termsError: {
      control: "boolean",
      description: "Whether to show the error state"
    }
  },
  component: TermsAndConditionsWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A terms and conditions checkbox component with animated error states and fade-out on acceptance. Features a subtle scale animation on error and supports reduced motion preferences."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/TermsAndConditions"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    termsAccepted: false,
    termsChecked: false,
    termsError: false
  },
  parameters: {
    docs: {
      description: {
        story: "Default unchecked state. Check the box before continuing."
      }
    }
  },
  render: TermsAndConditionsWrapper
};

export const Checked: Story = {
  args: {
    termsAccepted: false,
    termsChecked: true,
    termsError: false
  },
  parameters: {
    docs: {
      description: {
        story: "Checkbox in checked state, ready to continue."
      }
    }
  },
  render: TermsAndConditionsWrapper
};

export const Error: Story = {
  args: {
    termsAccepted: false,
    termsChecked: false,
    termsError: true
  },
  parameters: {
    docs: {
      description: {
        story: "Error state shown when user tries to continue without accepting terms."
      }
    }
  },
  render: TermsAndConditionsWrapper
};

export const Accepted: Story = {
  args: {
    termsAccepted: true,
    termsChecked: true,
    termsError: false
  },
  parameters: {
    docs: {
      description: {
        story: "Accepted state - the checkbox fades out with a scale animation."
      }
    }
  },
  render: TermsAndConditionsWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo showing the full flow: unchecked -> error -> checked -> accepted."
      }
    }
  },
  render: InteractiveDemo
};

export const CheckoutFlow: Story = {
  parameters: {
    docs: {
      description: {
        story: "Real-world example showing the terms checkbox in a checkout/confirmation flow."
      }
    }
  },
  render: CheckoutFlowDemo
};

export const ReducedMotion: Story = {
  args: {
    termsAccepted: false,
    termsChecked: false,
    termsError: false
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' to see instant transitions instead of animations."
      }
    }
  },
  render: TermsAndConditionsWrapper
};
