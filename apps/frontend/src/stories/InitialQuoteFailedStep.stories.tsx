import type { Meta, StoryObj } from "@storybook/react";
import { InitialQuoteFailedStep } from "../components/widget-steps/InitialQuoteFailedStep";
import { RampStateContext } from "../contexts/rampState";

// Helper to create a complete snapshot
const createSnapshot = (params: { callbackUrl?: string; apiKey?: string; partnerId?: string }) => ({
  children: {},
  context: {
    apiKey: params.apiKey,
    authToken: undefined,
    callbackUrl: params.callbackUrl,
    chainId: undefined,
    connectedWalletAddress: undefined,
    errorMessage: undefined,
    executionInput: undefined,
    externalSessionId: undefined,
    getMessageSignature: undefined,
    initializeFailedMessage: undefined,
    isQuoteExpired: false,
    isSep24Redo: false,
    partnerId: params.partnerId,
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
  value: "InitialFetchFailed"
});

const meta: Meta<typeof InitialQuoteFailedStep> = {
  component: InitialQuoteFailedStep,
  decorators: [
    (Story, context) => {
      const snapshot = createSnapshot(context.parameters.snapshotParams || {});

      return (
        <RampStateContext.Provider options={{ snapshot: snapshot as any }}>
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
          "The InitialQuoteFailedStep component displays an error when the initial quote fetch fails. It shows different messages and actions based on whether a callback URL is present."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/InitialQuoteFailedStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCallbackUrl: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the component when a callback URL is present. User will be redirected automatically after 5 seconds."
      }
    },
    snapshotParams: {
      callbackUrl: "https://example.com/callback"
    }
  }
};

export const WithoutCallbackUrl: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Shows the component without a callback URL. Displays a 'Try Again' button since no API key or partner ID is present."
      }
    },
    snapshotParams: {}
  }
};

export const WithApiKey: Story = {
  parameters: {
    docs: {
      description: {
        story: "When an API key is present, the 'Try Again' button is hidden as this is likely a programmatic integration."
      }
    },
    snapshotParams: {
      apiKey: "test_api_key_123"
    }
  }
};

export const WithPartnerId: Story = {
  parameters: {
    docs: {
      description: {
        story: "When a partner ID is present, the 'Try Again' button is hidden as this is likely a programmatic integration."
      }
    },
    snapshotParams: {
      partnerId: "partner_123"
    }
  }
};

export const WithBothApiKeyAndPartnerId: Story = {
  parameters: {
    docs: {
      description: {
        story: "With both API key and partner ID present, no retry button is shown."
      }
    },
    snapshotParams: {
      apiKey: "test_api_key_123",
      partnerId: "partner_123"
    }
  }
};
