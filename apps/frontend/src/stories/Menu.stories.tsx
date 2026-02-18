import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Menu, MenuAnimationDirection } from "../components/menus/Menu";

interface StoryArgs {
  animationDirection?: MenuAnimationDirection;
  title?: string;
}

const MenuWrapper = ({ animationDirection = MenuAnimationDirection.RIGHT, title = "Menu" }: StoryArgs) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="relative h-[400px] w-full max-w-md overflow-hidden rounded-lg border bg-gray-50">
      <div className="flex items-center justify-between bg-white p-4 shadow-sm">
        <span className="font-semibold">Main Content</span>
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={() => setIsOpen(true)}>
          Open Menu
        </button>
      </div>

      <div className="p-4">
        <p className="text-gray-600">This is the main content area. The menu will slide over this content.</p>
      </div>

      <Menu animationDirection={animationDirection} isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        <div className="space-y-4 p-4">
          <button className="w-full rounded bg-gray-100 p-3 text-left hover:bg-gray-200">Option 1</button>
          <button className="w-full rounded bg-gray-100 p-3 text-left hover:bg-gray-200">Option 2</button>
          <button className="w-full rounded bg-gray-100 p-3 text-left hover:bg-gray-200">Option 3</button>
        </div>
      </Menu>
    </div>
  );
};

const DirectionDemo = () => {
  const [direction, setDirection] = useState<MenuAnimationDirection>(MenuAnimationDirection.RIGHT);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded px-3 py-2 text-sm ${
            direction === MenuAnimationDirection.RIGHT ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setDirection(MenuAnimationDirection.RIGHT)}
        >
          From Right
        </button>
        <button
          className={`rounded px-3 py-2 text-sm ${
            direction === MenuAnimationDirection.TOP ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setDirection(MenuAnimationDirection.TOP)}
        >
          From Top
        </button>
      </div>

      <div className="relative h-[400px] overflow-hidden rounded-lg border bg-gray-50">
        <div className="flex items-center justify-between bg-white p-4 shadow-sm">
          <span className="font-semibold">Main Content</span>
          <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={() => setIsOpen(true)}>
            Open Menu
          </button>
        </div>

        <div className="p-4">
          <p className="text-gray-600">Current direction: {direction}</p>
        </div>

        <Menu animationDirection={direction} isOpen={isOpen} onClose={() => setIsOpen(false)} title="Settings">
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="font-medium text-sm">Theme</label>
              <select className="w-full rounded border p-2">
                <option>Light</option>
                <option>Dark</option>
                <option>System</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">Language</label>
              <select className="w-full rounded border p-2">
                <option>English</option>
                <option>Portuguese</option>
              </select>
            </div>
          </div>
        </Menu>
      </div>
    </div>
  );
};

const TokenSelectionDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const tokens = [
    { balance: "1,234.56", name: "USDC", network: "Polkadot" },
    { balance: "567.89", name: "USDT", network: "Ethereum" },
    { balance: "100.00", name: "BRZ", network: "Stellar" }
  ];

  return (
    <div className="relative h-[500px] w-full max-w-md overflow-hidden rounded-lg border bg-gray-50">
      <div className="bg-white p-4 shadow-sm">
        <button
          className="w-full rounded border border-gray-300 p-3 text-left hover:bg-gray-50"
          onClick={() => setIsOpen(true)}
        >
          <span className="text-gray-500 text-sm">Select Token</span>
          <p className="font-semibold">Choose a token to swap</p>
        </button>
      </div>

      <Menu
        animationDirection={MenuAnimationDirection.RIGHT}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Select Token"
      >
        <div className="p-2">
          {tokens.map(token => (
            <button
              className="flex w-full items-center justify-between rounded p-3 hover:bg-gray-100"
              key={token.name}
              onClick={() => setIsOpen(false)}
            >
              <div>
                <p className="font-semibold">{token.name}</p>
                <p className="text-gray-500 text-sm">{token.network}</p>
              </div>
              <span className="text-gray-600">{token.balance}</span>
            </button>
          ))}
        </div>
      </Menu>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    animationDirection: {
      control: "select",
      description: "Direction from which the menu slides in",
      options: [MenuAnimationDirection.RIGHT, MenuAnimationDirection.TOP]
    },
    title: {
      control: "text",
      description: "Title displayed in the menu header"
    }
  },
  component: MenuWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A sliding overlay menu component with directional animations. Supports slide-in from right or top with smooth easeOut curves. Features escape key support and reduced motion accessibility."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Menu"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    animationDirection: MenuAnimationDirection.RIGHT,
    title: "Menu"
  },
  parameters: {
    docs: {
      description: {
        story: "Default menu sliding in from the right. Press Escape or click the close button to dismiss."
      }
    }
  },
  render: MenuWrapper
};

export const FromTop: Story = {
  args: {
    animationDirection: MenuAnimationDirection.TOP,
    title: "Dropdown Menu"
  },
  parameters: {
    docs: {
      description: {
        story: "Menu sliding in from the top, useful for dropdown-style menus."
      }
    }
  },
  render: MenuWrapper
};

export const DirectionComparison: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo comparing different animation directions. Select a direction and open the menu."
      }
    }
  },
  render: DirectionDemo
};

export const TokenSelection: Story = {
  parameters: {
    docs: {
      description: {
        story: "Real-world example showing the menu used for token selection in a swap interface."
      }
    }
  },
  render: TokenSelectionDemo
};

export const ReducedMotion: Story = {
  args: {
    animationDirection: MenuAnimationDirection.RIGHT,
    title: "Accessible Menu"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' in browser DevTools to see instant transitions."
      }
    }
  },
  render: MenuWrapper
};
