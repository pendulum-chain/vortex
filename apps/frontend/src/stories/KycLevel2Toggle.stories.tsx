import type { Meta, StoryObj } from "@storybook/react";
import { AveniaDocumentType } from "@vortexfi/shared";
import { useState } from "react";
import { KycLevel2Toggle } from "../components/KycLevel2Toggle";

interface StoryArgs {
  activeDocType?: AveniaDocumentType;
}

const KycLevel2ToggleWrapper = ({ activeDocType = AveniaDocumentType.ID }: StoryArgs) => {
  const [docType, setDocType] = useState(activeDocType);

  return (
    <div className="w-full max-w-sm">
      <KycLevel2Toggle activeDocType={docType} onToggle={setDocType} />
    </div>
  );
};

const InteractiveDemo = () => {
  const [docType, setDocType] = useState<AveniaDocumentType>(AveniaDocumentType.ID);
  const [toggleCount, setToggleCount] = useState(0);

  const handleToggle = (newDocType: AveniaDocumentType) => {
    setDocType(newDocType);
    setToggleCount(prev => prev + 1);
  };

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="rounded bg-gray-100 p-4">
        <p className="font-medium text-sm">
          Selected document: {docType === AveniaDocumentType.ID ? "RG (ID Card)" : "CNH (Driver's License)"}
        </p>
        <p className="text-gray-500 text-sm">Toggle count: {toggleCount}</p>
      </div>
      <KycLevel2Toggle activeDocType={docType} onToggle={handleToggle} />
    </div>
  );
};

interface DocumentInfo {
  description: string;
  icon: string;
  instructions: string[];
  title: string;
}

const KycFlowDemo = () => {
  const [docType, setDocType] = useState<AveniaDocumentType>(AveniaDocumentType.ID);

  const documentInfo: Record<string, DocumentInfo> = {
    [AveniaDocumentType.ID]: {
      description: "Brazilian national identity card (Registro Geral)",
      icon: "RG",
      instructions: ["Front side of the document", "Back side of the document", "Must be valid and not expired"],
      title: "Identity Card (RG)"
    },
    [AveniaDocumentType.DRIVERS_LICENSE]: {
      description: "Brazilian driver's license (Carteira Nacional de Habilitacao)",
      icon: "CNH",
      instructions: ["Front side of the license", "Back side of the license", "Must be valid and not expired"],
      title: "Driver's License (CNH)"
    }
  };

  const info = documentInfo[docType];

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-lg">
      <h2 className="text-center font-bold text-blue-700 text-xl">Document Verification</h2>
      <p className="text-center text-gray-600 text-sm">Select your document type for KYC Level 2 verification</p>

      <KycLevel2Toggle activeDocType={docType} onToggle={setDocType} />

      <div className="rounded bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-800">{info.title}</h3>
        <p className="mb-3 text-gray-600 text-sm">{info.description}</p>
        <h4 className="mb-1 font-medium text-sm">Required photos:</h4>
        <ul className="list-inside list-disc text-gray-600 text-sm">
          {info.instructions.map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ul>
      </div>

      <button className="w-full rounded bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700">
        Start Verification with {info.icon}
      </button>
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  argTypes: {
    activeDocType: {
      control: "select",
      description: "Currently selected document type",
      options: [AveniaDocumentType.ID, AveniaDocumentType.DRIVERS_LICENSE]
    }
  },
  component: KycLevel2ToggleWrapper,
  parameters: {
    docs: {
      description: {
        component:
          "A toggle component for selecting between Brazilian document types (RG or CNH) during KYC Level 2 verification. Features smooth spring animation for the indicator and supports reduced motion preferences."
      }
    },
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/KycLevel2Toggle"
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: {
    activeDocType: AveniaDocumentType.ID
  },
  parameters: {
    docs: {
      description: {
        story: "Default toggle with RG (Identity Card) selected."
      }
    }
  },
  render: KycLevel2ToggleWrapper
};

export const DriversLicenseSelected: Story = {
  args: {
    activeDocType: AveniaDocumentType.DRIVERS_LICENSE
  },
  parameters: {
    docs: {
      description: {
        story: "Toggle with CNH (Driver's License) selected."
      }
    }
  },
  render: KycLevel2ToggleWrapper
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: "Interactive demo with state tracking. Watch the indicator smoothly animate between options."
      }
    }
  },
  render: InteractiveDemo
};

export const KycFlow: Story = {
  parameters: {
    docs: {
      description: {
        story: "Real-world example showing the toggle integrated into a KYC verification flow."
      }
    }
  },
  render: KycFlowDemo
};

export const ReducedMotion: Story = {
  args: {
    activeDocType: AveniaDocumentType.ID
  },
  parameters: {
    docs: {
      description: {
        story:
          "Test reduced motion support. Enable 'prefers-reduced-motion: reduce' in browser DevTools to see instant transitions."
      }
    }
  },
  render: KycLevel2ToggleWrapper
};
