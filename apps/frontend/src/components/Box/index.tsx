import { FC } from 'react';

export const Box: FC<{ className: string; children: React.ReactNode }> = ({ children, className }) => (
  <section
    className={
      'w-full max-w-2xl px-4 py-8 md:mx-4 mb-12 rounded-lg shadow-custom md:mx-8 md:mx-auto md:w-2/3 lg:w-3/5 xl:w-1/2 ' +
      className
    }
  >
    {children}
  </section>
);
