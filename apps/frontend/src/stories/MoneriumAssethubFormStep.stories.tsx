import type { Meta, StoryObj } from "@storybook/react";
import { FormProvider, useForm } from "react-hook-form";
import { MoneriumAssethubFormStep } from "../components/widget-steps/MoneriumAssethubFormStep";

// Wrapper to provide form context
const FormWrapper = ({ children, defaultValues, errors }: { children: React.ReactNode; defaultValues?: any; errors?: any }) => {
  const methods = useForm({
    defaultValues: defaultValues || {
      walletAddress: ""
    }
  });

  // Manually set errors if provided
  if (errors) {
    Object.keys(errors).forEach(key => {
      methods.setError(key as any, { message: errors[key], type: "manual" });
    });
  }

  return (
    <FormProvider {...methods}>
      <form>{children}</form>
    </FormProvider>
  );
};

const meta: Meta<typeof MoneriumAssethubFormStep> = {
  component: MoneriumAssethubFormStep,
  decorators: [
    (Story, context) => {
      const defaultValues = context.parameters.defaultValues;
      const errors = context.parameters.errors;

      return (
        <FormWrapper defaultValues={defaultValues} errors={errors}>
          <div className="mx-auto w-96 rounded-lg border bg-white p-6 shadow-custom">
            <Story />
          </div>
        </FormWrapper>
      );
    }
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The MoneriumAssethubFormStep component displays a wallet address input field for Monerium EUR onramps to AssetHub. Users enter their AssetHub wallet address where they want to receive assets."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/MoneriumAssethubFormStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the form with an empty wallet address field."
      }
    }
  }
};

export const WithWalletAddress: Story = {
  parameters: {
    defaultValues: {
      walletAddress: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
    },
    docs: {
      description: {
        story: "Shows the form with a pre-filled AssetHub (Polkadot) wallet address."
      }
    }
  }
};

export const WithValidationError: Story = {
  parameters: {
    defaultValues: {
      walletAddress: ""
    },
    docs: {
      description: {
        story: "Shows the form with a validation error when the wallet address is required but not provided."
      }
    },
    errors: {
      walletAddress: "Wallet address is required"
    }
  }
};

export const WithInvalidAddress: Story = {
  parameters: {
    defaultValues: {
      walletAddress: "invalid_address_format"
    },
    docs: {
      description: {
        story: "Shows the form with an invalid wallet address format error."
      }
    },
    errors: {
      walletAddress: "Invalid Polkadot wallet address"
    }
  }
};

export const LongAddress: Story = {
  parameters: {
    defaultValues: {
      walletAddress: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQYVeryLongAddressExample"
    },
    docs: {
      description: {
        story: "Shows how the component handles a very long wallet address."
      }
    }
  }
};
