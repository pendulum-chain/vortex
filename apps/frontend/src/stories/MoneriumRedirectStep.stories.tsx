import type { Meta, StoryObj } from "@storybook/react";
import { MoneriumRedirectStep } from "../components/widget-steps/MoneriumRedirectStep";
import { RampStateContext } from "../contexts/rampState";

// Helper to create a complete snapshot with Monerium KYC actor
const createSnapshot = () => ({
  children: {
    moneriumKyc: {
      getSnapshot: () => ({
        context: {},
        send: (event: any) => console.log("Monerium KYC event:", event),
        value: "Redirect"
      }),
      send: (event: any) => console.log("Monerium KYC send:", event)
    }
  },
  context: {
    apiKey: undefined,
    authToken: undefined,
    callbackUrl: undefined,
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
  value: "KYC"
});

const meta: Meta<typeof MoneriumRedirectStep> = {
  component: MoneriumRedirectStep,
  decorators: [
    Story => {
      const snapshot = createSnapshot();

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
          "The MoneriumRedirectStep component is shown when the user needs to be redirected to Monerium for KYC verification. It provides options to cancel or proceed to the partner site."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/MoneriumRedirectStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the Monerium redirect step with Cancel and Go to Partner buttons."
      }
    }
  }
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive version showing button click behavior (check console for events)."
      }
    }
  },
  play: async () => {
    console.log("MoneriumRedirectStep is interactive - click buttons to test");
  }
};
