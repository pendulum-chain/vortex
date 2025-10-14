import { AveniaDocumentType } from "@packages/shared";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface KycLevel2ToggleProps {
  activeDocType: AveniaDocumentType;
  onToggle: (docType: AveniaDocumentType) => void;
  disabled?: boolean;
}

export const KycLevel2Toggle = ({ activeDocType, onToggle }: KycLevel2ToggleProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative mb-6 flex justify-center">
      <div
        className="tooltip tooltip-primary tooltip-top tooltip-sm flex-1"
        data-tip={t("components.kycLevel2Toggle.temporarilyDisabled")}
      >
        <button
          className={`relative z-10 w-full px-4 py-2 text-center font-bold text-2xl transition-all duration-300 ${"text-gray-500"}`}
          disabled={true}
          onClick={() => onToggle(AveniaDocumentType.ID)}
        >
          RG
        </button>
      </div>
      <button
        className={`relative z-10 flex-1 px-4 py-2 text-center font-bold text-2xl transition-all duration-300 ${
          activeDocType === AveniaDocumentType.DRIVERS_LICENSE ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
        }`}
        onClick={() => onToggle(AveniaDocumentType.DRIVERS_LICENSE)}
      >
        CNH
      </button>

      <motion.div
        className="absolute bottom-0 h-0.5 bg-blue-700"
        layoutId="kycLevel2ToggleIndicator"
        style={{
          left: activeDocType === AveniaDocumentType.ID ? "0%" : "50%",
          width: "50%"
        }}
        transition={{
          bounce: 0.2,
          duration: 0.6,
          type: "spring"
        }}
      />
    </div>
  );
};
