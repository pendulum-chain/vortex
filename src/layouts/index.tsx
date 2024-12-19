import { FC } from 'preact/compat';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

interface BaseLayoutProps {
  main: ReactNode;
  modals?: ReactNode;
}

export const BaseLayout: FC<BaseLayoutProps> = ({ main, modals }) => (
  <>
    {modals}
    <Navbar />
    {main}
    <Footer />
  </>
);
