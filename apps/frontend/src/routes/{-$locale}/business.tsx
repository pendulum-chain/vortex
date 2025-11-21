import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { BusinessMain } from "../../pages/business";
import { WhyVortexBusiness } from "../../sections/WhyVortexBusiness";

export const Route = createFileRoute("/{-$locale}/business")({
  component: BusinessRouteComponent
});

function BusinessRouteComponent() {
  const main = (
    <>
      <BusinessMain />
      <WhyVortexBusiness />
    </>
  );

  return <BaseLayout main={main} />;
}
