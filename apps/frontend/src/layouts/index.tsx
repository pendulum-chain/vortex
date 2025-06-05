import { FC, ReactNode } from 'react';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { useWidgetMode } from '../hooks/useWidgetMode';

interface BaseLayoutProps {
  main: ReactNode;
  modals?: ReactNode;
}

export const BaseLayout: FC<BaseLayoutProps> = ({ main, modals }) => {
  const isWidgetMode = useWidgetMode();

  return (
    <>
      {modals}
      <Navbar />
      {main}
      {!isWidgetMode && <Footer />}
    </>
  );
};
