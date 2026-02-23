import type { Meta, StoryObj } from "@storybook/react";
import { RampDirection } from "@vortexfi/shared";
import { useState } from "react";
import { RampToggle } from "../components/RampToggle";

interface StoryArgs {
  activeDirection?: RampDirection;
}

const RampToggleWrapper = ({ activeDirection = RampDirection.BUY }: StoryArgs) => {
  const [direction, setDirection] = useState(activeDirection);

  return (
    <div className="w-full max-w-sm">
      <RampToggle activeDirection={direction} onToggle={setDirection} />
    </div>
  );
};

const InteractiveDemo = () => {
  const [direction, setDirection] = useState<RampDirection>(RampDirection.BUY);
  const [toggleCount, setToggleCount] = useState(0);

  const handleToggle = (newDirection: RampDirection) => {
    setDirection(newDirection);
    setToggleCount(prev => prev + 1);
  };

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">Current direction: {direction === RampDirection.BUY ? "Buy" : "Sell"}</p>
        <p className="text-gray-500 text-sm">Toggle count: {toggleCount}</p>
      </div>
      <RampToggle activeDirection={direction} onToggle={handleToggle} />
      <div className="rounded border p-4">
        {direction === RampDirection.BUY ? (
          <div>
            <h3 className="font-semibold text-green-600">Buy Crypto</h3>
            <p className="text-gray-600 text-sm">Convert fiat currency to cryptocurrency</p>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-blue-600">Sell Crypto</h3>
            <p className="text-gray-600 text-sm">Convert cryptocurrency to fiat currency</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SwapInterfaceDemo = () => {
  const [direction, setDirection] = useState<RampDirection>(RampDirection.BUY);
  const [amount, setAmount] = useState("100");

  return (
    <div className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-lg">
      <RampToggle activeDirection={direction} onToggle={setDirection} />

      <div className="space-y-4">
        <div className="rounded bg-gray-50 p-4">
          <label className="mb-1 block text-gray-500 text-sm">{direction === RampDirection.BUY ? "You pay" : "You send"}</label>
          <div className="flex items-center gap-2">
            <input
              className="w-full border-none bg-transparent font-semibold text-2xl focus:outline-none"
              onChange={e => setAmount(e.target.value)}
              type="text"
              value={amount}
            />
            <span className="font-medium text-gray-600">{direction === RampDirection.BUY ? "BRL" : "USDC"}</span>
          </div>
        </div>

        <div className="rounded bg-gray-50 p-4">
          <label className="mb-1 block text-gray-500 text-sm">
            {direction === RampDirection.BUY ? "You receive" : "You get"}
          </label>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-2xl">{(parseFloat(amount || "0") / 5).toFixed(2)}</span>
            <span className="font-medium text-gray-600">{direction === RampDirection.BUY ? "USDC" : "BRL"}</span>
          </div>
        </div>

        <button className="w-full rounded bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700">
          {direction === RampDirection.BUY ? "Buy USDC" : "Sell USDC"}
        </button>
      </div>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    activeDirection: {
      control: "select",
      description: "Currently active ramp direction",
      options: [RampDirection.BUY, RampDirection.SELL]
    }
  },
  component: RampToggleWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A toggle component for switching between Buy and Sell modes in the ramp interface. Features a smooth spring animation for the indicator and respects reduced motion preferences."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/RampToggle"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    activeDirection: RampDirection.BUY
  },
  parameters: {
    docs: {
      description: {
        story: "Default toggle with Buy selected. Click to switch between Buy and Sell."
      }
    }
  },
  render: RampToggleWrapper
};

export const SellActive: Story = {
  args: {
    activeDirection: RampDirection.SELL
  },
  parameters: {
    docs: {
      description: {
        story: "Toggle with Sell selected."
      }
    }
  },
  render: RampToggleWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo showing how the toggle updates the UI based on the selected direction."
      }
    }
  },
  render: InteractiveDemo
};

export const SwapInterface: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Real-world example showing the toggle integrated into a swap interface. Notice how the input/output labels and button text change based on the direction."
      }
    }
  },
  render: SwapInterfaceDemo
};

export const ReducedMotion: Story = {
  args: {
    activeDirection: RampDirection.BUY
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' in browser DevTools to see instant transitions instead of the spring animation."
      }
    }
  },
  render: RampToggleWrapper
};
