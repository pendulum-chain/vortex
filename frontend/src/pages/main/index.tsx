import { BaseLayout } from '../../layouts';
import { Ramp } from '../ramp';
import MainSections from './MainSections';

export const Main = () => {
  const main = (
    <main>
      <Ramp />
      <MainSections />
    </main>
  );

  return <BaseLayout main={main} />;
};
