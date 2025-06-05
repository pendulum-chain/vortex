import { FC } from 'react';
import { useWidgetMode } from '../../hooks/useWidgetMode';
import {
  FAQAccordion,
  FeeComparison,
  GotQuestions,
  HowToSell,
  PitchSection,
  PopularTokens,
  TrustedBy,
  WhyVortex,
} from '../../sections';

const MainSections: FC = () => {
  const isWidgetMode = useWidgetMode();

  if (isWidgetMode) {
    return null;
  }

  return (
    <>
      <PitchSection />
      <TrustedBy />
      <FeeComparison />
      <WhyVortex />
      <HowToSell />
      <PopularTokens />
      <FAQAccordion />
      <GotQuestions />
    </>
  );
};

export default MainSections;
