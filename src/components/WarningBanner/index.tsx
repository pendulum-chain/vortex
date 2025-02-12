import { FC } from 'react';
import { motion } from 'motion/react';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';

export const WarningBanner: FC = () => (
  <section className="flex items-center gap-4 p-4 bg-yellow-500 border-l-8 border-yellow-700 rounded shadow-lg">
    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
      <ExclamationCircleIcon className="w-12 text-yellow-800" />
    </motion.div>
    <div>
      <h1 className="text-xl font-extrabold text-yellow-900 uppercase">Do not close this tab!</h1>
      <p className="text-sm font-medium text-yellow-900">
        Closing this tab can result in your transaction failing. Please wait until it&apos;s completed.
      </p>
    </div>
  </section>
);
