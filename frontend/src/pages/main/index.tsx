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
      <WhyVortex />
      <HowToSell />
      <PopularTokens />
      <FAQAccordion />
      <GotQuestions />
      <PitchSection />
      <TrustedBy />
      <FeeComparison />
    </main>
  );

  return <BaseLayout main={main} />;
};
