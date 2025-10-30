import type { Meta, StoryObj } from "@storybook/react";
import { useForm } from "react-hook-form";
import { TextInput } from "../components/TextInput";

interface StoryArgs {
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  additionalStyle?: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  label?: string;
  pattern?: string;
  patternMessage?: string;
}

const TextInputWrapper = (args: StoryArgs) => {
  const { register } = useForm({
    defaultValues: {
      textInput: args.defaultValue || ""
    }
  });

  return (
    <div className="w-96">
      <TextInput
        {...args}
        register={register("textInput", {
          pattern: args.pattern ? new RegExp(args.pattern) : undefined,
          required: args.required
        })}
      />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    additionalStyle: {
      control: "text",
      description: "Additional CSS classes to apply"
    },
    autoFocus: {
      control: "boolean",
      description: "Whether the input should auto-focus on mount"
    },
    defaultValue: {
      control: "text",
      description: "Default value for the input (story helper)"
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled"
    },
    label: {
      control: "text",
      description: "Label for the input (form demo helper)"
    },
    pattern: {
      control: "text",
      description: "Validation pattern (form demo helper)"
    },
    patternMessage: {
      control: "text",
      description: "Pattern validation error message (form demo helper)"
    },
    placeholder: {
      control: "text",
      description: "Placeholder text"
    },
    readOnly: {
      control: "boolean",
      description: "Whether the input is read-only"
    },
    required: {
      control: "boolean",
      description: "Whether the field is required (for form demos)"
    },
    type: {
      control: "select",
      description: "Input type - 'default' uses Ethereum address pattern, 'email' uses email pattern",
      options: ["text", "email", "password", "default"]
    }
  },
  component: TextInputWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A customizable text input component with built-in validation patterns for Ethereum addresses and email addresses. Requires react-hook-form integration."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/TextInput"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    placeholder: "Enter your Ethereum address (0x...)"
  },
  render: TextInputWrapper
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: "0x742d35Cc6634C0532925a3b8D0C9e3e0C8b8E8e8"
  },
  render: TextInputWrapper
};

export const ReadOnly: Story = {
  args: {
    defaultValue: "0x742d35Cc6634C0532925a3b8D0C9e3e0C8b8E8e8",
    readOnly: true
  },
  render: TextInputWrapper
};

export const PasswordInput: Story = {
  args: {
    placeholder: "Enter your password",
    type: "password"
  },
  render: TextInputWrapper
};

export const WithCustomStyle: Story = {
  args: {
    additionalStyle: "border-2 border-purple-500 bg-purple-50",
    placeholder: "Custom styled input"
  },
  render: TextInputWrapper
};

export const LargeInput: Story = {
  args: {
    additionalStyle: "text-lg py-4",
    placeholder: "Large input"
  },
  render: TextInputWrapper
};

export const SmallInput: Story = {
  args: {
    additionalStyle: "text-sm py-1",
    placeholder: "Small input"
  },
  render: TextInputWrapper
};
