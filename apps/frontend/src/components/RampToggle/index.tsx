import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

export enum RampDirection {
  OFFRAMP = 'offramp',
  ONRAMP = 'onramp',
}

interface RampToggleProps {
  activeDirection: RampDirection;
  onToggle: (direction: RampDirection) => void;
}

export const RampToggle = ({ activeDirection, onToggle }: RampToggleProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center mb-6 relative">
      <button
        className={`cursor-pointer py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDirection === RampDirection.ONRAMP ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(RampDirection.ONRAMP)}
      >
        {t('components.swap.buyButton')}
      </button>
      <button
        className={`cursor-pointer py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDirection === RampDirection.OFFRAMP ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(RampDirection.OFFRAMP)}
      >
        {t('components.swap.sellButton')}
      </button>

      <motion.div
        layoutId="rampToggleIndicator"
        className="absolute bottom-0 h-0.5 bg-blue-700"
        style={{
          width: '50%',
          left: activeDirection === RampDirection.ONRAMP ? '0%' : '50%',
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
