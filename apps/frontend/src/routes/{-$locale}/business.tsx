import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { WhyVortexApi, WhyVortexBusiness, WhyVortexWidget } from "../../sections";
import { GotQuestions } from "../../sections/business/GotQuestions";
import { Hero } from "../../sections/business/Hero";

export const Route = createFileRoute("/{-$locale}/business")({
  component: BusinessRouteComponent
});

function BusinessRouteComponent() {
  const main = (
    <>
      <Hero />
      <WhyVortexBusiness />
      <WhyVortexApi />
      <WhyVortexWidget />
      <GotQuestions />
    </>
  );

  return <BaseLayout main={main} />;
}
