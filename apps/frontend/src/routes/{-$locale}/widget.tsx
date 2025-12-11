import { createFileRoute } from "@tanstack/react-router";
import { Ramp } from "../../pages/ramp";

export const Route = createFileRoute("/{-$locale}/widget")({
  component: RouteComponent
});

function RouteComponent() {
  return <Ramp />;
}
