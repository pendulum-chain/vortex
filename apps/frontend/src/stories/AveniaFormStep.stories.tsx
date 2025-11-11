import type { Meta, StoryObj } from "@storybook/react";
import { FormProvider, useForm } from "react-hook-form";
import { AveniaFormStep } from "../components/widget-steps/AveniaFormStep";

// Wrapper to provide form context
const FormWrapper = ({ children, defaultValues }: { children: React.ReactNode; defaultValues?: any }) => {
  const methods = useForm({
    defaultValues: defaultValues || {
      pixId: "",
      taxId: "",
      walletAddress: ""
    }
  });

  return (
    <FormProvider {...methods}>
      <form>{children}</form>
    </FormProvider>
  );
};

const meta: Meta<typeof AveniaFormStep> = {
  component: AveniaFormStep,
  decorators: [
    (Story, context) => {
      const defaultValues = context.parameters.defaultValues;

      return (
        <FormWrapper defaultValues={defaultValues}>
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
          "The AveniaFormStep component displays form fields for Brazilian users to enter their CPF/CNPJ, PIX key, and wallet address for BRL transactions."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/Widget Steps/AveniaFormStep"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Shows the Avenia form step with empty fields."
      }
    }
  }
};

export const WithWalletAddressDisabled: Story = {
  args: {
    isWalletAddressDisabled: true
  },
  parameters: {
    defaultValues: {
      pixId: "",
      taxId: "",
      walletAddress: "0x1234567890123456789012345678901234567890"
    },
    docs: {
      description: {
        story: "Shows the form with wallet address field disabled (when wallet is locked)."
      }
    }
  }
};

export const PrefilledData: Story = {
  parameters: {
    defaultValues: {
      pixId: "+5511999999999",
      taxId: "123.456.789-10",
      walletAddress: "0x1234567890123456789012345678901234567890"
    },
    docs: {
      description: {
        story: "Shows the form with pre-filled data."
      }
    }
  }
};
