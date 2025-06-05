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
import { useWidgetMode } from '../../hooks/useWidgetMode';
import { FC } from 'react';

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
