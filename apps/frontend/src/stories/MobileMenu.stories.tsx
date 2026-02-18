import type { Meta, StoryObj } from "@storybook/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { MobileMenu } from "../components/Navbar/MobileMenu";

interface StoryArgs {
  isOpen?: boolean;
}

const MobileMenuWrapper = ({ isOpen = true }: StoryArgs) => {
  const [menuOpen, setMenuOpen] = useState(isOpen);

  const handleMenuItemClick = () => {
    setMenuOpen(false);
  };

  return (
    <div className="relative h-[400px] w-full max-w-md bg-blue-950">
      {/* Mock navbar header */}
      <div className="flex items-center justify-between p-4">
        <span className="font-bold text-white text-xl">Vortex</span>
        <button className="rounded bg-blue-800 px-4 py-2 text-white" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "Close Menu" : "Open Menu"}
        </button>
      </div>

      {/* Mobile menu with animation */}
      <AnimatePresence>{menuOpen && <MobileMenu onMenuItemClick={handleMenuItemClick} />}</AnimatePresence>
    </div>
  );
};

const InteractiveDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [clickedItem, setClickedItem] = useState<string | null>(null);

  const handleMenuItemClick = () => {
    setClickedItem("Menu item clicked!");
    setIsOpen(false);
    setTimeout(() => setClickedItem(null), 2000);
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">Menu state: {isOpen ? "Open" : "Closed"}</p>
        {clickedItem && <p className="text-green-600 text-sm">{clickedItem}</p>}
      </div>

      <div className="relative h-[400px] overflow-hidden rounded-lg bg-blue-950">
        <div className="flex items-center justify-between p-4">
          <span className="font-bold text-white text-xl">Vortex</span>
          <button
            className="rounded bg-blue-800 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? "Close" : "Menu"}
          </button>
        </div>

        <AnimatePresence>{isOpen && <MobileMenu onMenuItemClick={handleMenuItemClick} />}</AnimatePresence>
      </div>
    </div>
  );
};

const AnimationShowcaseDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [speed, setSpeed] = useState<"normal" | "slow">("normal");

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex gap-2">
        <button
          className={`rounded px-4 py-2 ${speed === "normal" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setSpeed("normal")}
        >
          Normal Speed
        </button>
        <button
          className={`rounded px-4 py-2 ${speed === "slow" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setSpeed("slow")}
        >
          Slow (DevTools)
        </button>
      </div>
      <p className="text-gray-500 text-sm">
        To see the animation in slow motion, open DevTools → Rendering → check "Emulate CSS media feature
        prefers-reduced-motion"
      </p>

      <div className="relative h-[400px] overflow-hidden rounded-lg bg-blue-950">
        <div className="flex items-center justify-between p-4">
          <span className="font-bold text-white text-xl">Vortex</span>
          <button
            className="rounded bg-blue-800 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            onClick={() => setIsOpen(!isOpen)}
          >
            Toggle Menu
          </button>
        </div>

        <AnimatePresence>{isOpen && <MobileMenu onMenuItemClick={() => setIsOpen(false)} />}</AnimatePresence>
      </div>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    isOpen: {
      control: "boolean",
      description: "Whether the mobile menu is initially open"
    }
  },
  component: MobileMenuWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "Mobile navigation menu with staggered entrance animations. Features smooth slide-in animations for menu items and respects reduced motion preferences for accessibility. Uses easeOut curves for responsive feel."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/MobileMenu"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    isOpen: true
  },
  parameters: {
    docs: {
      description: {
        story: "Mobile menu in its open state showing navigation links and call-to-action button."
      }
    }
  },
  render: MobileMenuWrapper
};

export const Closed: Story = {
  args: {
    isOpen: false
  },
  parameters: {
    docs: {
      description: {
        story: "Mobile menu in closed state. Click the button to open and see the entrance animation."
      }
    }
  },
  render: MobileMenuWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo with state tracking. Toggle the menu to see smooth entrance/exit animations."
      }
    }
  },
  render: InteractiveDemo
};

export const AnimationShowcase: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Showcase the staggered animation effect. Open the menu multiple times to observe how menu items animate in sequence."
      }
    }
  },
  render: AnimationShowcaseDemo
};

export const ReducedMotion: Story = {
  args: {
    isOpen: false
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' in browser DevTools to see instant transitions instead of animations."
      }
    }
  },
  render: MobileMenuWrapper
};
