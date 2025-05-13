import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

export const AirdropBanner = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    setExpanded((state) => !state);
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
      <div className="flex flex-col items-center justify-center">
        <div className="flex items-center justify-between text-center">
          <div>
            <h1 className="text-xl">
              🪂<strong> {t('components.airdropBanner.title')}</strong>
            </h1>
            <p className="font-medium">{t('components.airdropBanner.description')}</p>
          </div>
          <div>
            <ChevronDownIcon className={`w-6 h-6 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
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
                <Trans i18nKey="components.airdropBanner.list.1">
                  All eligible users get $10 USDT - <strong>the first 100 receive a 10 bonus, totaling 20 USDT.</strong>{' '}
                  Rewards go to your wallet on Base or AssetHub.
                </Trans>
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Trans i18nKey="components.airdropBanner.list.2">
                  One reward per person, paid out every 24 hours – <strong>Check your status</strong>
                  <a
                    className="underline hover:text-blue-700 transition font-bold"
                    href="https://github.com/pendulum-chain/vortex/blob/campaign-may-2025/eligible-users.csv"
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    rel="noreferrer"
                  >
                    {' '}
                    here
                  </a>
                  .
                </Trans>
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Trans i18nKey="components.airdropBanner.list.3">
                  Your trust matters – <strong>Vortex is </strong>
                  <a
                    className="underline hover:text-blue-700 transition font-bold"
                    href="https://github.com/pendulum-chain/vortex"
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    rel="noreferrer"
                  >
                    open source
                  </a>{' '}
                  for full transparency.
                </Trans>
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
