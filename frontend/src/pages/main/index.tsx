import {
  GotQuestions,
  TrustedBy,
  FAQAccordion,
  HowToSell,
  PopularTokens,
  WhyVortex,
  FeeComparison,
  PitchSection,
} from '../../sections';
import { BaseLayout } from '../../layouts';
import { Ramp } from '../ramp';

export const Main = () => {
  const main = (
    <main>
      <Ramp />
      <PitchSection />
      <TrustedBy />
      <FeeComparison />
      <WhyVortex />
      <HowToSell />
      <PopularTokens />
      <FAQAccordion />
      <GotQuestions />
    </main>
  );

  return <BaseLayout main={main} />;
};
