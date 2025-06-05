import { motion } from 'motion/react';
import { KYCDocType } from '../../services/api';

interface KycLevel2ToggleProps {
  activeDocType: KYCDocType;
  onToggle: (docType: KYCDocType) => void;
  disabled?: boolean;
}

export const KycLevel2Toggle = ({ activeDocType, onToggle }: KycLevel2ToggleProps) => {
  return (
    <div className="flex justify-center mb-6 relative">
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDocType === KYCDocType.RG ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(KYCDocType.RG)}
      >
        RG
      </button>
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDocType === KYCDocType.CNH ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(KYCDocType.CNH)}
      >
        CNH
      </button>

      <motion.div
        layoutId="kycLevel2ToggleIndicator"
        className="absolute bottom-0 h-0.5 bg-blue-700"
        style={{
          width: '50%',
          left: activeDocType === KYCDocType.RG ? '0%' : '50%',
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
