import { motion } from 'motion/react';
import { Trans } from 'react-i18next';

export const PitchSection = () => (
  <section className="mx-4 mt-8 mb-18 sm:container sm:mx-auto">
    <motion.h1
      className="text-4xl sm:leading-[3.8rem] text-center text-black sm:text-5xl"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <Trans i18nKey="sections.pitch.title">
        Sell <strong className="text-primary">Stablecoins</strong> and receive <br className="hidden sm:block" /> the
        money directly in your Bank Account
      </Trans>
    </motion.h1>
    <motion.p
      className="mt-4 text-center text-black sm:mt-10 sm:text-lg"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Trans i18nKey="sections.pitch.description">
        Complete everything in one simple step. With our trusted local partners, <br className="hidden sm:block" />{' '}
        enjoy fast, secure transactions and the best rates in the market.
      </Trans>
    </motion.p>
  </section>
);
