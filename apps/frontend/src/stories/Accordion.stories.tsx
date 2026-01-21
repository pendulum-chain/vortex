import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/Accordion";

interface StoryArgs {
  defaultValue?: string[];
  itemCount?: number;
}

const faqItems = [
  {
    answer:
      "Vortex is a cross-border payments gateway built on the Pendulum blockchain. It enables on-ramping and off-ramping of fiat currencies through stablecoins using cross-chain swaps.",
    question: "What is Vortex?",
    value: "item-1"
  },
  {
    answer:
      "You can buy crypto using PIX (Brazilian instant payment system) or other supported payment methods. Simply enter the amount you want to buy, provide your details, and complete the payment.",
    question: "How do I buy crypto?",
    value: "item-2"
  },
  {
    answer:
      "Vortex supports multiple stablecoins including USDC, USDT, and BRZ (Brazilian Real stablecoin). We're constantly adding support for more tokens.",
    question: "What currencies are supported?",
    value: "item-3"
  },
  {
    answer:
      "Transaction times vary depending on the payment method and network conditions. PIX transactions typically complete within minutes, while cross-chain transfers may take a few minutes longer.",
    question: "How long do transactions take?",
    value: "item-4"
  },
  {
    answer:
      "Yes, Vortex uses industry-standard security practices including encryption, secure key management, and integration with trusted payment partners. Your funds and data are protected at all times.",
    question: "Is Vortex secure?",
    value: "item-5"
  }
];

const AccordionWrapper = ({ defaultValue = [], itemCount = 3 }: StoryArgs) => {
  const items = faqItems.slice(0, itemCount);

  return (
    <div className="w-full max-w-2xl">
      <Accordion defaultValue={defaultValue}>
        {items.map(item => (
          <AccordionItem key={item.value} value={item.value}>
            <AccordionTrigger value={item.value}>{item.question}</AccordionTrigger>
            <AccordionContent value={item.value}>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

const InteractiveDemo = () => {
  const [openItems, setOpenItems] = useState<string[]>(["item-1"]);

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="mb-4 rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">Currently open items: {openItems.length > 0 ? openItems.join(", ") : "None"}</p>
      </div>
      <Accordion defaultValue={openItems}>
        {faqItems.map(item => (
          <AccordionItem key={item.value} value={item.value}>
            <AccordionTrigger value={item.value}>{item.question}</AccordionTrigger>
            <AccordionContent value={item.value}>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    defaultValue: {
      control: "object",
      description: "Array of item values that should be open by default"
    },
    itemCount: {
      control: { max: 5, min: 1, step: 1, type: "range" },
      description: "Number of accordion items to display"
    }
  },
  component: AccordionWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "An accessible accordion component with smooth expand/collapse animations. Features reduced motion support for accessibility and uses GPU-accelerated animations via grid-template-rows instead of height transitions."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Accordion"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    defaultValue: [],
    itemCount: 3
  },
  parameters: {
    docs: {
      description: {
        story: "Default accordion with all items collapsed. Click on any item to expand it."
      }
    }
  },
  render: AccordionWrapper
};

export const SingleItemOpen: Story = {
  args: {
    defaultValue: ["item-1"],
    itemCount: 3
  },
  parameters: {
    docs: {
      description: {
        story: "Accordion with the first item expanded by default."
      }
    }
  },
  render: AccordionWrapper
};

export const MultipleItemsOpen: Story = {
  args: {
    defaultValue: ["item-1", "item-3"],
    itemCount: 5
  },
  parameters: {
    docs: {
      description: {
        story: "Accordion with multiple items expanded simultaneously."
      }
    }
  },
  render: AccordionWrapper
};

export const AllItems: Story = {
  args: {
    defaultValue: [],
    itemCount: 5
  },
  parameters: {
    docs: {
      description: {
        story: "Full FAQ accordion with all 5 items available."
      }
    }
  },
  render: AccordionWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo showing the accordion state changes. Open/close items to see the state update."
      }
    }
  },
  render: InteractiveDemo
};

export const ReducedMotion: Story = {
  args: {
    defaultValue: ["item-1"],
    itemCount: 3
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion by enabling 'prefers-reduced-motion: reduce' in your browser DevTools (Rendering panel). Animations will be disabled for accessibility."
      }
    }
  },
  render: AccordionWrapper
};
