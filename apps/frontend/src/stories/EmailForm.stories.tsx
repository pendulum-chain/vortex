import type { Meta, StoryObj } from "@storybook/react";
import { EmailForm } from "../components/EmailForm";

interface StoryArgs {
  transactionId?: string;
  transactionSuccess: boolean;
  simulateDelay?: number;
  forceError?: boolean;
  forcePending?: boolean;
}

const EmailFormWrapper = ({ transactionId, transactionSuccess }: StoryArgs) => {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <EmailForm transactionId={transactionId} transactionSuccess={transactionSuccess} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    forceError: {
      control: "boolean",
      description: "Force an error state when submitting (for testing error handling)"
    },
    forcePending: {
      control: "boolean",
      description: "Keep the form in pending state indefinitely (for testing loading state)"
    },
    simulateDelay: {
      control: { max: 5000, min: 0, step: 100, type: "range" },
      description: "Delay in milliseconds before API response (for testing loading states)"
    },
    transactionId: {
      control: "text",
      description: "Transaction ID to be sent with the email submission"
    },
    transactionSuccess: {
      control: "boolean",
      description: "Boolean indicating if the transaction was successful (used for event tracking)"
    }
  },
  component: EmailFormWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A form component that collects user emails for feedback purposes. It integrates with react-query for API calls, react-hook-form for form management, and includes event tracking. The form shows different states based on submission status: idle, loading, success, and error."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/EmailForm"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    transactionId: "tx_1234567890abcdef"
  },
  parameters: {
    docs: {
      description: {
        story: "Default state of the EmailForm, ready for user input. Shows the form with title, description, and input field."
      }
    }
  },
  render: EmailFormWrapper
};
