import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import PLANET from '../../assets/planet.svg';

const FORM_URL = 'https://forms.gle/dKh8ckXheRPdRa398';

export const GotQuestions = () => {
  const { t } = useTranslation();

  return (
    <section className="px-8 py-20 overflow-hidden text-white bg-blue-900">
      <div className="relative flex flex-col justify-between mx-auto sm:container md:flex-row">
        <motion.img
          src={PLANET}
          alt="Planet"
          className="absolute left-0 w-full md:w-1/2"
          whileInView={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
          viewport={{ once: true }}
          initial={{ x: -100, y: 100, opacity: 0, rotate: -30 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          whileHover={{ scale: 1.02 }}
        />
        <div className="z-10 md:w-1/2">
          <h1 className="text-4xl">{t('sections.gotQuestions.title')}</h1>
        </div>
        <div className="z-10 flex flex-col md:w-1/2 md:items-end">
          <p className="mt-3 mb-4 text-lg md:mt-0 md:text-end">{t('sections.gotQuestions.description')}</p>
          <a
            href={FORM_URL}
            className="flex items-center gap-2 px-6 mx-auto md:mx-0 btn rounded-3xl btn-vortex-secondary"
          >
            <span>{t('sections.gotQuestions.contactUs')}</span>
            <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
          </a>
        </div>
      </div>
    </section>
  );
};
