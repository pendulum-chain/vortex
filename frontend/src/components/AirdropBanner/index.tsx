import { useState } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'motion/react';

export const AirdropBanner = () => {
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
       <h1 className='text-xl'>🪂<strong> Airdrop offer</strong></h1>
        <p className="font-medium">
            Deposit R$5 or €10 to Get 20 USDT for FREE!
        </p>
       </div>

        </div>
        <button className="bg-[#000] text-white px-4 py-2 rounded-md mt-4 cursor-pointer">More info</button>
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
                Buy or sell from just R$5 (PIX) or €10 (SEPA) - quick, easy, and no hidden fees.
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                All eligible users get $10 USDT - <strong>the first 100 receive a $10 bonus, totaling $20 USDT.</strong> Rewards go to your wallet on Base or AssetHub.
              </motion.li>
              <motion.li
                className="mb-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                One reward per user - we use KYC and on-chain checks to ensure fairness and prevent abuse.
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
