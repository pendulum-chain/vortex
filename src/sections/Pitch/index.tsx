import { motion } from 'motion/react';

export const PitchSection = () => {
  return (
    <section className="mx-4 mt-8 mb-18 sm:container sm:mx-auto">
      <motion.h1
        className="text-4xl sm:leading-[3.8rem] text-center text-black sm:text-5xl"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        Sell <strong className="text-primary">Stablecoins</strong> and receive <br className="hidden sm:block" /> the
        money directly in your Bank Account
      </motion.h1>
      <motion.p
        className="mt-4 text-center text-black sm:mt-10 sm:text-lg"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        Complete everything in one simple step. With our trusted local partners, <br className="hidden sm:block" />{' '}
        enjoy fast, secure transactions and the best rates in the market.
      </motion.p>
    </section>
  );
};
