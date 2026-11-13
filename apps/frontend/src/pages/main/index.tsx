import { BaseLayout } from "../../layouts";
import { FAQAccordion, FeeComparison, HowToSell, PopularTokens, TrustedBy, WhyVortex } from "../../sections";
import { GotQuestions } from "../../sections/individuals/GotQuestions";
import { Hero } from "../../sections/individuals/Hero";
import { ProductDiscovery } from "../../sections/ProductDiscovery";

export const Main = () => {
  const main = (
    <main>
      <Hero />
      <ProductDiscovery audience="individuals" />
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
