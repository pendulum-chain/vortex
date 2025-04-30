import { useState } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';
export const AirdropBanner = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const rotation = useMotionValue(0);

  const toggleExpand = () => {
    rotation.set(expanded ? 0 : 180);
    setExpanded(!expanded);
  };

  return (
    <motion.div
      className="bg-[#e8b923] text-black mt-12 mx-3 rounded-lg shadow-custom md:mx-auto md:w-96 px-4 py-2 cursor-pointer"
      onClick={toggleExpand}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={{ scale: 1.01 }}
    >
      <div className='flex flex-col items-center justify-center'>
       <div className="flex items-center justify-between text-center">
        <div>
       <h1 className='text-xl'>🪂<strong> {t('components.airdropBanner.title')}</strong></h1>
        <p className="font-medium">
            {t('components.airdropBanner.description')}
        </p>
       </div>

        </div>
        <button className="bg-[#000] text-white px-4 py-2 rounded-md mt-4 cursor-pointer">{t('components.airdropBanner.button')}</button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="mt-4 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <ul className="pl-5 my-2 list-disc">
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                {t('components.airdropBanner.list.1')}
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Trans i18nKey="components.airdropBanner.list.2">All eligible users get $10 USDT - <strong>the first 100 receive a 10 bonus, totaling 20 USDT.</strong> Rewards go to your wallet on Base or AssetHub.</Trans>
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                {t('components.airdropBanner.list.3')}
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
