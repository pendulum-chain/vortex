import type { Meta, StoryObj } from "@storybook/react";
import { ErrorStep } from "../components/widget-steps/ErrorStep";
import { RampStateContext } from "../contexts/rampState"; // Helper to create a complete snapshot with error state

// Helper to create a complete snapshot with error state
const createErrorSnapshot = (params: { apiKey?: string; errorMessage?: string }) => ({
  children: {},
  context: {
    apiKey: params.apiKey,
    authToken: undefined,
    callbackUrl: undefined,
    chainId: undefined,
    connectedWalletAddress: undefined,
    errorMessage: params.errorMessage,
    executionInput: undefined,
    externalSessionId: undefined,
    getMessageSignature: undefined,
    initializeFailedMessage: undefined,
    isQuoteExpired: false,
    isSep24Redo: false,
    partnerId: undefined,
    paymentData: undefined,
    quote: undefined,
    quoteId: undefined,
    quoteLocked: undefined,
    rampDirection: undefined,
    rampPaymentConfirmed: false,
    rampSigningPhase: undefined,
    rampState: undefined,
    substrateWalletAccount: undefined,
    walletLocked: undefined
  },
  error: undefined,
  historyValue: undefined,
  output: undefined,
  status: "active" as const,
  tags: new Set(),
  value: "Error"
});

const meta: Meta<typeof ErrorStep> = {
  component: ErrorStep,
  decorators: [
    (Story, context) => {
      const snapshot = createErrorSnapshot(context.parameters.snapshotParams || {});

      return (
        <RampStateContext.Provider options={{ snapshot }}>
          <div className="mx-auto w-96 rounded-lg border bg-white p-6 shadow-custom">
            <Story />
          </div>
        </RampStateContext.Provider>
      );
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

export const DefaultErrorWithApiKey: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the error step with the default error message but without try again button."
      }
    },
    snapshotParams: {
      apiKey: "demo-api-key",
      errorMessage: undefined
    }
  }
};

export const NetworkError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays a network connection error message."
      }
    },
    snapshotParams: {
      errorMessage: "Network connection failed. Please check your internet connection and try again."
    }
  }
};

export const ValidationError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows an error when transaction parameters are invalid."
      }
    },
    snapShotParams: {
      errorMessage: "Invalid transaction parameters. Please verify your input and try again."
    }
  }
};

export const ServerError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays a server error message."
      }
    },
    snapShotParams: {
      errorMessage: "Server error occurred while processing your request. Please try again later."
    }
  }
};

export const QuoteExpiredError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows an error when the quote has expired."
      }
    },
    snapShotParams: {
      errorMessage: "Your quote has expired. Please refresh and request a new quote."
    }
  }
};

export const InsufficientFundsError: Story = {
  parameters: {
    docs: {
      description: {
        story: "Displays an insufficient funds error."
      }
    },
    snapShotParams: {
      errorMessage: "Insufficient funds to complete this transaction."
    }
  }
};

export const LongErrorMessage: Story = {
  parameters: {
    docs: {
      description: {
        story: "Demonstrates how the component handles a very long error message with automatic text wrapping."
      }
    },
    snapShotParams: {
      errorMessage:
        "An unexpected error occurred while processing your transaction. The system encountered a critical failure during the validation phase of your request. This could be due to network connectivity issues, server maintenance, or invalid transaction parameters. Please verify all your inputs are correct and try again. If the problem persists, please contact our support team with the transaction ID for further assistance."
    }
  }
};
