import type { Meta, StoryObj } from "@storybook/react";
import { CopyButton } from "../components/CopyButton";

const meta: Meta<typeof CopyButton> = {
  argTypes: {
    className: {
      control: "text",
      description: "Custom classnames for styling"
    },
    iconPosition: {
      control: { type: "radio" },
      defaultValue: "left",
      description: "Position of the icon",
      options: ["left", "right"]
    },
    noBorder: {
      control: "boolean",
      description: "Remove border and background"
    },
    onClick: {
      action: "clicked",
      description: "Function called when button is clicked"
    },
    text: {
      control: "text",
      description: "Text to copy"
    }
  },
  component: CopyButton,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/CopyButton"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: "0x1234567890abcdef"
  }
};

export const NoBorder: Story = {
  args: {
    noBorder: true,
    text: "Copy With No Border"
  }
};

export const IconRight: Story = {
  args: {
    iconPosition: "right",
    text: "Right Icon"
  }
};

export const CustomClass: Story = {
  args: {
    className: "bg-indigo-100 text-indigo-900 font-bold px-3 py-2",
    text: "Custom Styled"
  }
};

export const LongText: Story = {
  args: {
    text: "This is a much longer text value meant to demonstrate how multiline or long text looks inside the CopyButton component."
  }
};

export const AllProps: Story = {
  args: {
    className: "text-green-600",
    iconPosition: "right",
    noBorder: true,
    text: "All Props Example"
  }
};
