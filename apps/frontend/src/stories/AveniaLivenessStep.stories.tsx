import type { Meta, StoryObj } from "@storybook/react";
import { AveniaLivenessStep } from "../components/widget-steps/AveniaLivenessStep";

// Create mock Avenia KYC actor
const createMockAveniaKycActor = (livenessCheckOpened: boolean = false) => ({
  send: (event: any) => {
    console.log("Avenia KYC event:", event);
  }
});

// Create mock Avenia state
const createMockAveniaState = (livenessCheckOpened: boolean = false, livenessUrl: string = "https://example.com/liveness") => ({
  context: {
    documentUploadIds: {
      livenessUrl: livenessUrl
    },
    livenessCheckOpened: livenessCheckOpened
  },
  stateValue: "LivenessCheck"
});

const meta: Meta<typeof AveniaLivenessStep> = {
  component: AveniaLivenessStep,
  decorators: [
    (Story, context) => {
      return (
        <div className="mx-auto w-96 rounded-lg border bg-white p-6 shadow-custom">
          <Story />
        </div>
      );
    }
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The AveniaLivenessStep component guides users through the liveness check process with Avenia. It opens an external URL for facial verification."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/AveniaLivenessStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeLivenessCheck: Story = {
  args: {
    aveniaKycActor: createMockAveniaKycActor(false) as any,
    aveniaState: createMockAveniaState(false) as any
  },
  parameters: {
    docs: {
      description: {
        story: "Shows the initial state before the user opens the liveness check."
      }
    }
  }
};

export const AfterLivenessCheckOpened: Story = {
  args: {
    aveniaKycActor: createMockAveniaKycActor(true) as any,
    aveniaState: createMockAveniaState(true) as any
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows the state after the user has opened the liveness check URL. Displays 'Verification Complete' button and troubleshooting link."
      }
    }
  }
};

export const WithoutLivenessUrl: Story = {
  args: {
    aveniaKycActor: createMockAveniaKycActor(false) as any,
    aveniaState: createMockAveniaState(false, "") as any
  },
  parameters: {
    docs: {
      description: {
        story: "Shows the component when liveness URL is not available (button disabled)."
      }
    }
  }
};
