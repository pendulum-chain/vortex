import { BrlaKYCDocType } from "@packages/shared";
import { motion } from "motion/react";

interface KycLevel2ToggleProps {
  activeDocType: BrlaKYCDocType;
  onToggle: (docType: BrlaKYCDocType) => void;
  disabled?: boolean;
}

export const KycLevel2Toggle = ({ activeDocType, onToggle }: KycLevel2ToggleProps) => {
  return (
    <div className="relative mb-6 flex justify-center">
      <button
        className={`relative z-10 flex-1 px-4 py-2 text-center font-bold text-2xl transition-all duration-300 ${
          activeDocType === BrlaKYCDocType.RG ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
        }`}
        onClick={() => onToggle(BrlaKYCDocType.RG)}
      >
        RG
      </button>
      <button
        className={`relative z-10 flex-1 px-4 py-2 text-center font-bold text-2xl transition-all duration-300 ${
          activeDocType === BrlaKYCDocType.CNH ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
        }`}
        onClick={() => onToggle(BrlaKYCDocType.CNH)}
      >
        CNH
      </button>

      <motion.div
        className="absolute bottom-0 h-0.5 bg-blue-700"
        layoutId="kycLevel2ToggleIndicator"
        style={{
          left: activeDocType === BrlaKYCDocType.RG ? "0%" : "50%",
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
