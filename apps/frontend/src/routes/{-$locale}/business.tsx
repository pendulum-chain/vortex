import { createFileRoute } from "@tanstack/react-router";
import { BusinessMain } from "../../pages/business";
import { Main } from "../../pages/main";

export const Route = createFileRoute("/{-$locale}/business")({
  component: BusinessRouteComponent
});

function BusinessRouteComponent() {
  return (
    <>
      <BusinessMain />
    </>
  );
}
