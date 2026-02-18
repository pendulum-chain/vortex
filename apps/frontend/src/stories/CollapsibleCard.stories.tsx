import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CollapsibleCard, CollapsibleDetails, CollapsibleSummary, useCollapsibleCard } from "../components/CollapsibleCard";

interface StoryArgs {
  defaultExpanded?: boolean;
  showToggleButton?: boolean;
}

const ToggleButton = () => {
  const { isExpanded, toggle } = useCollapsibleCard();

  return (
    <button
      className="flex items-center gap-1 rounded bg-blue-100 px-3 py-1 font-medium text-blue-700 text-sm transition-colors hover:bg-blue-200"
      onClick={toggle}
    >
      {isExpanded ? "Hide" : "Show"} Details
      <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
    </button>
  );
};

const CollapsibleCardWrapper = ({ defaultExpanded = false }: StoryArgs) => {
  return (
    <div className="w-full max-w-md">
      <CollapsibleCard defaultExpanded={defaultExpanded}>
        <CollapsibleSummary>
          <div>
            <h3 className="font-semibold text-lg">Transaction Summary</h3>
            <p className="text-gray-500 text-sm">Click to view details</p>
          </div>
          <ToggleButton />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount</span>
              <span className="font-medium">100 USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Fee</span>
              <span className="font-medium">0.5 USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Network</span>
              <span className="font-medium">Polkadot</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Estimated Time</span>
              <span className="font-medium">~2 minutes</span>
            </div>
          </div>
        </CollapsibleDetails>
      </CollapsibleCard>
    </div>
  );
};

const InteractiveDemo = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [toggleCount, setToggleCount] = useState(0);

  const handleToggle = (expanded: boolean) => {
    setIsExpanded(expanded);
    setToggleCount(prev => prev + 1);
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">State: {isExpanded ? "Expanded" : "Collapsed"}</p>
        <p className="text-gray-500 text-sm">Toggle count: {toggleCount}</p>
      </div>
      <CollapsibleCard defaultExpanded={false} onToggle={handleToggle}>
        <CollapsibleSummary>
          <div>
            <h3 className="font-semibold text-lg">Quote Details</h3>
            <p className="text-gray-500 text-sm">Your exchange rate and fees</p>
          </div>
          <ToggleButton />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">You send</span>
              <span className="font-medium">500 BRL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Exchange rate</span>
              <span className="font-medium">1 USDC = 5.02 BRL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">You receive</span>
              <span className="font-medium text-green-600">~99.60 USDC</span>
            </div>
          </div>
        </CollapsibleDetails>
      </CollapsibleCard>
    </div>
  );
};

const MultipleCardsDemo = () => {
  return (
    <div className="w-full max-w-md space-y-4">
      <CollapsibleCard>
        <CollapsibleSummary>
          <div>
            <h3 className="font-semibold">Step 1: Connect Wallet</h3>
          </div>
          <ToggleButton />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <p className="text-gray-600">Connect your Polkadot wallet to get started with the transaction.</p>
        </CollapsibleDetails>
      </CollapsibleCard>

      <CollapsibleCard defaultExpanded>
        <CollapsibleSummary>
          <div>
            <h3 className="font-semibold">Step 2: Enter Details</h3>
          </div>
          <ToggleButton />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <p className="text-gray-600">Enter your payment details including the amount and recipient information.</p>
        </CollapsibleDetails>
      </CollapsibleCard>

      <CollapsibleCard>
        <CollapsibleSummary>
          <div>
            <h3 className="font-semibold">Step 3: Confirm</h3>
          </div>
          <ToggleButton />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <p className="text-gray-600">Review and confirm your transaction before submitting.</p>
        </CollapsibleDetails>
      </CollapsibleCard>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    defaultExpanded: {
      control: "boolean",
      description: "Whether the card should be expanded by default"
    }
  },
  component: CollapsibleCardWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A collapsible card component with smooth expand/collapse animations. Uses GPU-accelerated grid-template-rows animation instead of height for better performance. Supports reduced motion for accessibility."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/CollapsibleCard"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    defaultExpanded: false
  },
  parameters: {
    docs: {
      description: {
        story: "Default collapsed state. Click the toggle button to expand and see the details."
      }
    }
  },
  render: CollapsibleCardWrapper
};

export const Expanded: Story = {
  args: {
    defaultExpanded: true
  },
  parameters: {
    docs: {
      description: {
        story: "Card expanded by default showing all details."
      }
    }
  },
  render: CollapsibleCardWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo with state tracking. Watch the state change as you toggle the card."
      }
    }
  },
  render: InteractiveDemo
};

export const MultipleCards: Story = {
  parameters: {
    docs: {
      description: {
        story: "Multiple collapsible cards demonstrating independent expand/collapse behavior."
      }
    }
  },
  render: MultipleCardsDemo
};

export const ReducedMotion: Story = {
  args: {
    defaultExpanded: false
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support by enabling 'prefers-reduced-motion: reduce' in browser DevTools. The expand/collapse animation will be instant."
      }
    }
  },
  render: CollapsibleCardWrapper
};
