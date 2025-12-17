import { BaseLayout } from "../../layouts";
import { FAQAccordion, FeeComparison, HowToSell, PopularTokens, TrustedBy, WhyVortex } from "../../sections";
import { GotQuestions } from "../../sections/individuals/GotQuestions";
import { Hero } from "../../sections/individuals/Hero";

export const Main = () => {
  const main = (
    <main>
      <Hero />
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
