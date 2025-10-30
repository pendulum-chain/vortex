import type { Meta, StoryObj } from "@storybook/react";
import { ErrorStep } from "../components/widget-steps/ErrorStep";

// Note: This story requires manual mocking of the useRampActor hook
// The decorator below provides a workaround for Storybook rendering

const meta: Meta<typeof ErrorStep> = {
  component: ErrorStep,
  decorators: [
    (Story, context) => {
      // Import and override the hook module
      const errorMessage = context.parameters.errorMessage;

      // Create a wrapper that injects the mock into the component's context
      const React = require("react");
      const { useRampActor: originalHook } = require("../contexts/rampState");

      // Mock useRampActor to return our test data
      const mockActor = {
        getSnapshot: () => ({
          context: {
            errorMessage: errorMessage
          }
        }),
        send: (event: any) => {
          console.log("Mock RESET_RAMP called", event);
        }
      };

      // Override the module temporarily
      const module = require("../contexts/rampState");
      const original = module.useRampActor;
      module.useRampActor = () => mockActor;

      const result = (
        <div className="mx-auto w-96 rounded-lg border bg-white p-6 shadow-custom">
          <Story />
        </div>
      );

      // Restore original (though this happens after render)
      module.useRampActor = original;

      return result;
    }
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The ErrorStep component displays an error message to the user when something goes wrong in the ramp process. It includes a retry button that allows users to start over."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/ErrorStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the error step with the default error message when no specific error is provided."
      }
    },
    errorMessage: undefined
  }
};

export const NetworkError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays a network connection error message."
      }
    },
    errorMessage: "Network connection failed. Please check your internet connection and try again."
  }
};

export const ValidationError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows an error when transaction parameters are invalid."
      }
    },
    errorMessage: "Invalid transaction parameters. Please verify your input and try again."
  }
};

export const ServerError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays a server error message."
      }
    },
    errorMessage: "Server error occurred while processing your request. Please try again later."
  }
};

export const QuoteExpiredError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows an error when the quote has expired."
      }
    },
    errorMessage: "Your quote has expired. Please refresh and request a new quote."
  }
};

export const InsufficientFundsError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays an insufficient funds error."
      }
    },
    errorMessage: "Insufficient funds to complete this transaction."
  }
};

export const LongErrorMessage: Story = {
  parameters: {
    docs: {
      description: {
        story: "Demonstrates how the component handles a very long error message with automatic text wrapping."
      }
    },
    errorMessage:
      "An unexpected error occurred while processing your transaction. The system encountered a critical failure during the validation phase of your request. This could be due to network connectivity issues, server maintenance, or invalid transaction parameters. Please verify all your inputs are correct and try again. If the problem persists, please contact our support team with the transaction ID for further assistance."
  }
};
