import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';

export enum SwapDirection {
  OFFRAMP = 'offramp',
  ONRAMP = 'onramp',
}

interface SwapToggleProps {
  activeDirection: SwapDirection;
  onToggle: (direction: SwapDirection) => void;
}

export const SwapToggle = ({ activeDirection, onToggle }: SwapToggleProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center mb-6 relative">
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDirection === SwapDirection.ONRAMP ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(SwapDirection.ONRAMP)}
      >
        {t('components.swap.buyButton')}
      </button>
      <button
        className={`py-2 px-4 text-2xl font-bold text-center transition-all duration-300 flex-1 relative z-10 ${
          activeDirection === SwapDirection.OFFRAMP ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onToggle(SwapDirection.OFFRAMP)}
      >
        {t('components.swap.sellButton')}
      </button>

      <motion.div
        layoutId="swapToggleIndicator"
        className="absolute bottom-0 h-0.5 bg-blue-700"
        style={{
          width: '50%',
          left: activeDirection === SwapDirection.ONRAMP ? '0%' : '50%',
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
