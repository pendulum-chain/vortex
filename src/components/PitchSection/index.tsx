import { motion } from 'framer-motion';

export const PitchSection = () => {
  return (
    <section className="container mx-auto mt-12">
      <motion.h1
        className="mb-4 text-4xl text-center text-black"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        Sell <strong className="text-primary">Stablecoins</strong> and receive <br className="hidden sm:block" /> the
        money directly in your Bank Account
      </motion.h1>
      <motion.p
        className="text-lg text-center text-black"
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
