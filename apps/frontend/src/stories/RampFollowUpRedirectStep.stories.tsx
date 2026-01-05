import type { Meta, StoryObj } from "@storybook/react";
import { RampFollowUpRedirectStep } from "../components/widget-steps/RampFollowUpRedirectStep";
import { RampStateContext } from "../contexts/rampState";

// Helper to create a complete snapshot
const createSnapshot = (callbackUrl: string = "https://example.com/callback") => ({
  children: {},
  context: {
    apiKey: undefined,
    authToken: undefined,
    callbackUrl: callbackUrl,
    chainId: undefined,
    connectedWalletAddress: undefined,
    errorMessage: undefined,
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
  value: "RedirectCallback"
});

const meta: Meta<typeof RampFollowUpRedirectStep> = {
  component: RampFollowUpRedirectStep,
  decorators: [
    (Story, context) => {
      const callbackUrl = context.parameters.callbackUrl as string | undefined;
      const snapshot = createSnapshot(callbackUrl);

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
          "The RampFollowUpRedirectStep component is shown after a successful ramp transaction when a callback URL is provided. It displays a countdown and automatically redirects the user."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/RampFollowUpRedirectStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    callbackUrl: "https://example.com/callback",
    docs: {
      description: {
        story: "Shows the redirect step with default callback URL and countdown timer."
      }
    }
  }
};

export const CustomCallback: Story = {
  parameters: {
    callbackUrl: "https://myapp.com/return?status=success",
    docs: {
      description: {
        story: "Shows the redirect step with a custom callback URL."
      }
    }
  }
};

export const LongUrl: Story = {
  parameters: {
    callbackUrl:
      "https://example.com/very/long/path/to/callback/with/many/parameters?param1=value1&param2=value2&param3=value3",
    docs: {
      description: {
        story: "Shows how the component handles a very long callback URL."
      }
    }
  }
};
