import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchInput } from "../components/SearchInput";

interface StoryArgs {
  placeholder?: string;
  className?: string;
}

const meta: Meta = {
  parameters: {
    docs: {
      description: {
        component:
          "A search input component with a magnifying glass icon. Uses react-i18next for internationalization. The component is controlled via a setter function that updates the search value."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/SearchInput"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Default SearchInput with the standard placeholder text from i18n translations."
      }
    }
  },
  render: () => {
    const [, setSearchValue] = useState("");
    return (
      <div className="w-96">
        <SearchInput set={setSearchValue} />
      </div>
    );
  }
};

export const WithCustomPlaceholder: Story = {
  parameters: {
    docs: {
      description: {
        story: "SearchInput with a custom placeholder text instead of the default i18n value."
      }
    }
  },
  render: () => {
    const [, setSearchValue] = useState("");
    return (
      <div className="w-96">
        <SearchInput placeholder="Search for assets..." set={setSearchValue} />
      </div>
    );
  }
};

export const WithCustomStyling: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "SearchInput with custom CSS classes applied. The className prop can be used to override the default width and add custom styling."
      }
    }
  },
  render: () => {
    const [, setSearchValue] = useState("");
    return (
      <div className="w-full">
        <SearchInput className="w-80 border-2 border-blue-500" placeholder="Custom styled search" set={setSearchValue} />
      </div>
    );
  }
};

export const DifferentWidths: Story = {
  parameters: {
    docs: {
      description: {
        story: "SearchInput components with different width configurations to show responsive behavior."
      }
    }
  },
  render: () => {
    const [, setSearch1] = useState("");
    const [, setSearch2] = useState("");
    const [, setSearch3] = useState("");

    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-gray-700 text-sm">Full Width (w-full)</p>
          <SearchInput className="w-full" placeholder="Full width search" set={setSearch1} />
        </div>
        <div>
          <p className="mb-2 text-gray-700 text-sm">Medium Width (w-96)</p>
          <SearchInput className="w-96" placeholder="Medium width search" set={setSearch2} />
        </div>
        <div>
          <p className="mb-2 text-gray-700 text-sm">Small Width (w-64)</p>
          <SearchInput className="w-64" placeholder="Small width search" set={setSearch3} />
        </div>
      </div>
    );
  }
};

export const WithFilteredList: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Practical example showing SearchInput used to filter a list of items. The search is case-insensitive and filters as you type."
      }
    }
  },
  render: () => {
    const [searchValue, setSearchValue] = useState("");

    const items = [
      "Bitcoin (BTC)",
      "Ethereum (ETH)",
      "Polkadot (DOT)",
      "Stellar (XLM)",
      "USDC",
      "USDT",
      "DAI",
      "Amplitude (AMPE)",
      "Pendulum (PEN)"
    ];

    const filteredItems = items.filter(item => item.toLowerCase().includes(searchValue.toLowerCase()));

    return (
      <div className="w-96 space-y-4">
        <SearchInput placeholder="Search assets..." set={setSearchValue} />
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-gray-900 text-sm">
            Assets ({filteredItems.length} of {items.length})
          </h3>
          {filteredItems.length > 0 ? (
            <ul className="space-y-2">
              {filteredItems.map((item, idx) => (
                <li className="rounded bg-gray-50 px-3 py-2 text-gray-700 text-sm" key={idx}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No assets found matching "{searchValue}"</p>
          )}
        </div>
      </div>
    );
  }
};
