import type { Meta, StoryObj } from "@storybook/react";
import { CloseButton } from "../components/buttons/CloseButton";

const meta: Meta<typeof CloseButton> = {
  argTypes: {
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled"
    },
    onClick: {
      action: "clicked",
      description: "Function called when button is clicked"
    }
  },
  component: CloseButton,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/CloseButton"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClick: () => console.log("Close button clicked")
  }
};

export const Disabled: Story = {
  args: {
    disabled: true,
    onClick: () => console.log("Close button clicked")
  }
};

export const WithCustomProps: Story = {
  args: {
    "aria-label": "Close dialog",
    onClick: () => console.log("Close button clicked"),
    title: "Close this dialog"
  }
};

export const InModal: Story = {
  render: () => (
    <div className="relative rounded-lg border bg-white p-6 shadow-lg" style={{ width: "400px" }}>
      <div className="absolute top-2 right-2">
        <CloseButton onClick={() => console.log("Modal closed")} />
      </div>
      <h2 className="mb-4 pr-8 font-bold text-xl">Modal Title</h2>
      <p className="mb-4">This is a modal with a close button in the top-right corner.</p>
      <button className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">Action Button</button>
    </div>
  )
};

export const InHeader: Story = {
  render: () => (
    <div className="rounded-lg border bg-gray-50 p-4 shadow-sm" style={{ width: "500px" }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Header with Close Button</h3>
        <CloseButton onClick={() => console.log("Header closed")} />
      </div>
      <p className="mt-2 text-gray-600">This demonstrates a close button in a header context.</p>
    </div>
  )
};

export const MultipleButtons: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span>Card 1</span>
          <CloseButton onClick={() => console.log("Card 1 closed")} />
        </div>
      </div>
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span>Card 2</span>
          <CloseButton onClick={() => console.log("Card 2 closed")} />
        </div>
      </div>
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span>Card 3</span>
          <CloseButton disabled onClick={() => console.log("Card 3 closed")} />
        </div>
      </div>
    </div>
  )
};
