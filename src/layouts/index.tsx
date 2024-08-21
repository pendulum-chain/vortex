import { FC } from 'preact/compat';
import { Navbar } from '../components/Navbar';

interface BaseLayoutProps {
  main: ReactNode;
  modals?: ReactNode;
}

export const BaseLayout: FC<BaseLayoutProps> = ({ main, modals }) => (
  <>
    {modals}
    <Navbar />
    {main}
  </>
);
