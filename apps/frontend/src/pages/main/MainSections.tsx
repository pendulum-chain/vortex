import { FC } from "react";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { FAQAccordion, FeeComparison, HowToSell, PopularTokens, TrustedBy, WhyVortex } from "../../sections";
import { GotQuestions } from "../../sections/individuals/GotQuestions";
import { Hero } from "../../sections/individuals/Hero";

const MainSections: FC = () => {
  const isWidgetMode = useWidgetMode();

  if (isWidgetMode) {
    return null;
  }

  return (
    <>
      <Hero />
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
