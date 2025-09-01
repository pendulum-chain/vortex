import { RampDirection } from "@packages/shared";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface RampToggleProps {
  activeDirection: RampDirection;
  onToggle: (direction: RampDirection) => void;
}

export const RampToggle = ({ activeDirection, onToggle }: RampToggleProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative mb-6 flex justify-center">
      <button
        className={`relative z-10 flex-1 cursor-pointer px-4 py-2 text-center font-bold text-2xl transition-all duration-150 ${
          activeDirection === RampDirection.BUY ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
        }`}
        onClick={() => onToggle(RampDirection.BUY)}
      >
        {t("components.swap.buyButton")}
      </button>
      <button
        className={`relative z-10 flex-1 cursor-pointer px-4 py-2 text-center font-bold text-2xl transition-all duration-150 ${
          activeDirection === RampDirection.SELL ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
        }`}
        onClick={() => onToggle(RampDirection.SELL)}
      >
        {t("components.swap.sellButton")}
      </button>

      <motion.div
        className="absolute bottom-0 h-0.5 bg-blue-700"
        layoutId="rampToggleIndicator"
        style={{
          left: activeDirection === RampDirection.BUY ? "0%" : "50%",
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
