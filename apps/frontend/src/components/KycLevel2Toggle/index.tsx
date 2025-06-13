import { BrlaKYCDocType } from '@packages/shared';
import { motion } from 'motion/react';
interface KycLevel2ToggleProps {
  activeDocType: BrlaKYCDocType;
  onToggle: (docType: BrlaKYCDocType) => void;
  disabled?: boolean;
}

export const KycLevel2Toggle = ({ activeDocType, onToggle }: KycLevel2ToggleProps) => {
  return (
    <div className="flex justify-center mb-6 relative">
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDocType === BrlaKYCDocType.RG ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(BrlaKYCDocType.RG)}
      >
        RG
      </button>
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDocType === BrlaKYCDocType.CNH ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(BrlaKYCDocType.CNH)}
      >
        CNH
      </button>

      <motion.div
        layoutId="kycLevel2ToggleIndicator"
        className="absolute bottom-0 h-0.5 bg-blue-700"
        style={{
          width: '50%',
          left: activeDocType === BrlaKYCDocType.RG ? '0%' : '50%',
        }}
        transition={{
          type: 'spring',
          bounce: 0.2,
          duration: 0.6,
        }}
      />
    </div>
  );
};
