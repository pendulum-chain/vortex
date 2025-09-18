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

// Wrapper component to provide react-hook-form context
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

// Form demo wrapper for interactive stories
const FormDemoWrapper = (args: StoryArgs) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm({
    defaultValues: {
      textInput: args.defaultValue || ""
    }
  });

  const watchedValue = watch("textInput");

  const onSubmit = (data: Record<string, string>) => {
    console.log("Form submitted:", data);
    alert(`Form submitted with value: ${data.textInput}`);
  };

  return (
    <form className="w-96 space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block font-medium text-sm">{args.label || "Text Input"}</label>
        <TextInput
          {...args}
          register={register("textInput", {
            pattern: args.pattern
              ? {
                  message: args.patternMessage || "Invalid format",
                  value: new RegExp(args.pattern)
                }
              : undefined,
            required: args.required ? "This field is required" : false
          })}
        />
        {errors.textInput && <p className="mt-1 text-red-500 text-sm">{String(errors.textInput.message)}</p>}
      </div>
      <div className="text-gray-600 text-sm">
        Current value: <code>{watchedValue}</code>
      </div>
      <button className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600" type="submit">
        Submit
      </button>
    </form>
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

// Basic Stories
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

// Form Integration Stories
export const InFormContext: Story = {
  args: {
    label: "Ethereum Address",
    placeholder: "0x742d35Cc6634C0532925a3b8D0C9e3e0C8b8E8e8",
    required: true,
    type: "default"
  },
  parameters: {
    docs: {
      description: {
        story: "Demonstrates TextInput within a form with validation and submission"
      }
    }
  },
  render: FormDemoWrapper
};

export const EmailFormValidation: Story = {
  args: {
    label: "Email Address",
    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    patternMessage: "Please enter a valid email address",
    placeholder: "user@example.com",
    required: true,
    type: "email"
  },
  render: FormDemoWrapper
};

export const OptionalField: Story = {
  args: {
    label: "Optional Field",
    placeholder: "This field is optional",
    required: false
  },
  render: FormDemoWrapper
};

// Interactive Demonstration Stories
export const ValidationDemo: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demonstration of real-time validation for Ethereum addresses"
      }
    }
  },
  render: () => {
    const {
      register,
      watch,
      formState: { errors }
    } = useForm();
    const watchedValue = watch("demo");

    const isValidEthAddress = (value: string) => {
      const pattern = /^(0x[a-fA-F0-9]{40})$/;
      return pattern.test(value);
    };

    return (
      <div className="w-96 space-y-4">
        <div>
          <label className="mb-2 block font-medium text-sm">Ethereum Address Validation Demo</label>
          <TextInput
            placeholder="0x742d35Cc6634C0532925a3b8D0C9e3e0C8b8E8e8"
            register={register("demo", {
              validate: value => isValidEthAddress(value) || "Invalid Ethereum address format"
            })}
            type="default"
          />
          {errors.demo && <p className="mt-1 text-red-500 text-sm">{String(errors.demo.message)}</p>}
        </div>
        <div className="space-y-1 text-sm">
          <div>
            Current value: <code>{watchedValue || "(empty)"}</code>
          </div>
          <div>
            Valid format:{" "}
            <span className={isValidEthAddress(watchedValue || "") ? "text-green-600" : "text-red-600"}>
              {isValidEthAddress(watchedValue || "") ? "✓ Valid" : "✗ Invalid"}
            </span>
          </div>
          <div className="text-gray-600">Expected format: 0x followed by 40 hexadecimal characters</div>
        </div>
      </div>
    );
  }
};

export const MultipleInputsForm: Story = {
  parameters: {
    docs: {
      description: {
        story: "Complete form example with multiple TextInput components and different validation rules"
      }
    }
  },
  render: () => {
    const {
      register,
      handleSubmit,
      formState: { errors }
    } = useForm();

    const onSubmit = (data: Record<string, string>) => {
      console.log("Form data:", data);
      alert(`Form submitted:\nAddress: ${data.address}\nEmail: ${data.email}\nName: ${data.name}`);
    };

    return (
      <form className="w-96 space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="mb-2 block font-medium text-sm">Name</label>
          <TextInput placeholder="Enter your name" register={register("name", { required: "Name is required" })} type="text" />
          {errors.name && <p className="mt-1 text-red-500 text-sm">{String(errors.name.message)}</p>}
        </div>

        <div>
          <label className="mb-2 block font-medium text-sm">Email</label>
          <TextInput
            placeholder="user@example.com"
            register={register("email", {
              pattern: {
                message: "Invalid email format",
                value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
              },
              required: "Email is required"
            })}
            type="email"
          />
          {errors.email && <p className="mt-1 text-red-500 text-sm">{String(errors.email.message)}</p>}
        </div>

        <div>
          <label className="mb-2 block font-medium text-sm">Ethereum Address</label>
          <TextInput
            placeholder="0x742d35Cc6634C0532925a3b8D0C9e3e0C8b8E8e8"
            register={register("address", {
              pattern: {
                message: "Invalid Ethereum address format",
                value: /^(0x[a-fA-F0-9]{40})$/
              },
              required: "Ethereum address is required"
            })}
            type="default"
          />
          {errors.address && <p className="mt-1 text-red-500 text-sm">{String(errors.address.message)}</p>}
        </div>

        <button className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600" type="submit">
          Submit Form
        </button>
      </form>
    );
  }
};
