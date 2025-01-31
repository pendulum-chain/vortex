import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { motion } from 'framer-motion';
import PLANET from '../../assets/planet.svg';

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc3TtNxDj_p4smgWVCU2mayXl-0T7LLAgCN6chOTKhCL15-5Q/viewform';

export const Banner = () => {
  return (
    <section className="relative flex flex-col justify-between px-8 mx-auto overflow-hidden text-white sm:container py-14 md:flex-row bg-primary sm:rounded-3xl">
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
        <h1 className="text-4xl">Got Questions? We&apos;re here to help!</h1>
      </div>
      <div className="z-10 flex flex-col md:w-1/2 md:items-end">
        <p className="mt-3 mb-4 text-lg md:mt-0 md:text-end">Get in touch with us for answers and support.</p>
        <a
          href={FORM_URL}
          className="flex items-center gap-2 px-6 mx-auto md:mx-0 btn rounded-3xl btn-vortex-secondary"
        >
          <span>Contact Us</span>
          <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
        </a>
      </div>
    </section>
  );
};
