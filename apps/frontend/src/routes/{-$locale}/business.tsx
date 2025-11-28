import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { BusinessMain } from "../../pages/business";
import { WhyVortexApi } from "../../sections/WhyVortexApi";
import { WhyVortexBusiness } from "../../sections/WhyVortexBusiness";

export const Route = createFileRoute("/{-$locale}/business")({
  component: BusinessRouteComponent
});

function BusinessRouteComponent() {
  const main = (
    <>
      <BusinessMain />
      <WhyVortexBusiness />
      <WhyVortexApi />
    </>
  );

  return <BaseLayout main={main} />;
}
