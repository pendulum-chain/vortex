import { BrDocumentType } from "@vortexfi/shared";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../helpers/cn";

interface KycLevel2ToggleProps {
  activeDocType: BrDocumentType;
  onToggle: (docType: BrDocumentType) => void;
  disabled?: boolean;
}

export const KycLevel2Toggle = ({ activeDocType, onToggle }: KycLevel2ToggleProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative mb-6 flex justify-center">
      <button
        className={cn(
          "relative z-10 w-full flex-1 px-4 py-2 text-center font-bold text-2xl transition-colors duration-300",
          activeDocType === BrDocumentType.ID ? "text-primary" : "text-gray-500 hover:text-gray-700"
        )}
        onClick={() => onToggle(BrDocumentType.ID)}
      >
        RG
      </button>
      <button
        className={cn(
          "relative z-10 flex-1 px-4 py-2 text-center font-bold text-2xl transition-colors duration-300",
          activeDocType === BrDocumentType.DRIVERS_LICENSE ? "text-primary" : "text-gray-500 hover:text-gray-700"
        )}
        onClick={() => onToggle(BrDocumentType.DRIVERS_LICENSE)}
      >
        CNH
      </button>

      <motion.div
        className="absolute bottom-0 h-0.5 bg-primary"
        layoutId="kycLevel2ToggleIndicator"
        style={{
          left: activeDocType === BrDocumentType.ID ? "0%" : "50%",
          width: "50%"
        }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                bounce: 0.2,
                duration: 0.6,
                type: "spring"
              }
        }
      />
    </div>
  );
};
