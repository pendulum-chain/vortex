import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SelectionButtonMotion } from "../components/TokenSelection/NetworkSelectionList/animations/SelectionButtonMotion";
import { SelectionChevronMotion } from "../components/TokenSelection/NetworkSelectionList/animations/SelectionChevronMotion";
import { SelectionDropdownMotion } from "../components/TokenSelection/NetworkSelectionList/animations/SelectionDropdownMotion";

const networks = [
  { icon: "polkadot.svg", id: "polkadot", name: "Polkadot" },
  { icon: "ethereum.svg", id: "ethereum", name: "Ethereum" },
  { icon: "stellar.svg", id: "stellar", name: "Stellar" },
  { icon: "moonbeam.svg", id: "moonbeam", name: "Moonbeam" }
];

const SelectionDropdownDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(networks[0]);

  return (
    <div className="w-full max-w-xs">
      <button
        className="flex w-full items-center justify-between rounded-lg border bg-white p-3"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium">{selected.name}</span>
        <SelectionChevronMotion isOpen={isOpen}>
          <ChevronDownIcon className="h-5 w-5" />
        </SelectionChevronMotion>
      </button>

      <SelectionDropdownMotion className="mt-1 rounded-lg border bg-white shadow-lg" isOpen={isOpen}>
        <div className="p-1">
          {networks.map(network => (
            <button
              className={`w-full rounded p-2 text-left hover:bg-gray-100 ${
                selected.id === network.id ? "bg-blue-50 text-blue-700" : ""
              }`}
              key={network.id}
              onClick={() => {
                setSelected(network);
                setIsOpen(false);
              }}
            >
              {network.name}
            </button>
          ))}
        </div>
      </SelectionDropdownMotion>
    </div>
  );
};

const SelectionButtonDemo = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2">
        <SelectionButtonMotion
          className="rounded-lg border bg-white p-3 text-left"
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Full width button - click to collapse" : "Click"}
        </SelectionButtonMotion>

        {!isExpanded && (
          <div className="flex-1 rounded-lg border bg-gray-50 p-3">
            <span className="text-gray-500">Other content</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-gray-500 text-sm">The button animates between 10% and 100% width. Click to toggle.</p>
    </div>
  );
};

const SelectionChevronDemo = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <button className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2" onClick={() => setIsOpen(!isOpen)}>
        <span>Toggle Chevron</span>
        <SelectionChevronMotion isOpen={isOpen}>
          <ChevronDownIcon className="h-5 w-5" />
        </SelectionChevronMotion>
      </button>

      <p className="text-gray-500 text-sm">Chevron rotates 180° when {isOpen ? "open" : "closed"}</p>
    </div>
  );
};

const NetworkDropdownDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState(networks[0]);

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-lg">
        <h3 className="mb-4 font-semibold">Select Network</h3>

        <div className="relative">
          <button
            className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
            onClick={() => setIsOpen(!isOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                <span className="font-bold text-xs">{selectedNetwork.name.charAt(0)}</span>
              </div>
              <span className="font-medium">{selectedNetwork.name}</span>
            </div>
            <SelectionChevronMotion isOpen={isOpen}>
              <ChevronDownIcon className="h-5 w-5 text-gray-500" />
            </SelectionChevronMotion>
          </button>

          <SelectionDropdownMotion
            className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg"
            isOpen={isOpen}
          >
            <div className="p-1">
              {networks.map(network => (
                <button
                  className={`flex w-full items-center gap-3 rounded p-3 text-left hover:bg-gray-100 ${
                    selectedNetwork.id === network.id ? "bg-blue-50" : ""
                  }`}
                  key={network.id}
                  onClick={() => {
                    setSelectedNetwork(network);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                    <span className="font-bold text-xs">{network.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-medium">{network.name}</p>
                    <p className="text-gray-500 text-sm">Network</p>
                  </div>
                </button>
              ))}
            </div>
          </SelectionDropdownMotion>
        </div>
      </div>
    </div>
  );
};

const AllAnimationsDemo = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="w-full max-w-md space-y-6">
      <h3 className="font-semibold text-lg">All Selection Animations</h3>

      <div className="space-y-2">
        <p className="font-medium text-sm">1. SelectionButtonMotion</p>
        <SelectionButtonMotion
          className="rounded-lg border bg-blue-600 p-3 text-white"
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Expanded - Click to Collapse" : "Expand"}
        </SelectionButtonMotion>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-sm">2. SelectionChevronMotion</p>
        <div className="flex items-center gap-4">
          <button
            className="flex items-center gap-2 rounded-lg border px-4 py-2"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span>Dropdown</span>
            <SelectionChevronMotion isOpen={dropdownOpen}>
              <ChevronDownIcon className="h-4 w-4" />
            </SelectionChevronMotion>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-sm">3. SelectionDropdownMotion</p>
        <SelectionDropdownMotion className="rounded-lg border bg-gray-50" isOpen={dropdownOpen}>
          <div className="space-y-2 p-4">
            <p className="font-medium">Dropdown Content</p>
            <p className="text-gray-600 text-sm">This content smoothly expands using grid-template-rows animation.</p>
          </div>
        </SelectionDropdownMotion>
      </div>
    </div>
  );
};

const meta: Meta = {
  parameters: {
    docs: {
      description: {
        component:
          "A collection of animation components used in the network/token selection interface. Includes:\n\n" +
          "- **SelectionDropdownMotion**: Smooth expand/collapse using GPU-accelerated grid-template-rows\n" +
          "- **SelectionButtonMotion**: Width animation with easeOut curve\n" +
          "- **SelectionChevronMotion**: 180° rotation animation for dropdown indicators\n\n" +
          "All components support reduced motion preferences for accessibility."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/NetworkSelection"
};

export default meta;
type Story = StoryObj;

export const Dropdown: Story = {
  parameters: {
    docs: {
      description: {
        story: "SelectionDropdownMotion with SelectionChevronMotion combined for a complete dropdown experience."
      }
    }
  },
  render: SelectionDropdownDemo
};

export const Button: Story = {
  parameters: {
    docs: {
      description: {
        story: "SelectionButtonMotion demonstrates width animation between collapsed (10%) and expanded (100%) states."
      }
    }
  },
  render: SelectionButtonDemo
};

export const Chevron: Story = {
  parameters: {
    docs: {
      description: {
        story: "SelectionChevronMotion provides smooth 180° rotation for dropdown indicators."
      }
    }
  },
  render: SelectionChevronDemo
};

export const NetworkDropdown: Story = {
  parameters: {
    docs: {
      description: {
        story: "Real-world example showing all three animation components working together in a network selector."
      }
    }
  },
  render: NetworkDropdownDemo
};

export const AllAnimations: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo showcasing all three animation components side by side."
      }
    }
  },
  render: AllAnimationsDemo
};

export const ReducedMotion: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' in browser DevTools to see instant transitions instead of animations."
      }
    }
  },
  render: AllAnimationsDemo
};
