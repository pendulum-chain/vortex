import type { Meta, StoryObj } from "@storybook/react";
import { MaskedAccountNumber } from "../components/MaskedAccountNumber";

const meta: Meta<typeof MaskedAccountNumber> = {
  argTypes: {
    accountNumber: {
      control: "text",
      description: "The full account number to display masked"
    }
  },
  component: MaskedAccountNumber,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/MaskedAccountNumber"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    accountNumber: "1234567890"
  }
};

export const ShortNumber: Story = {
  args: {
    accountNumber: "12345678"
  }
};

export const LongIBAN: Story = {
  args: {
    accountNumber: "DE89370400440532013000"
  }
};

export const RoutingNumber: Story = {
  args: {
    accountNumber: "021000021"
  }
};
