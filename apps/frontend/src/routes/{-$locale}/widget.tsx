import { createFileRoute } from "@tanstack/react-router";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { Ramp } from "../../pages/ramp";

export const Route = createFileRoute("/{-$locale}/widget")({
  component: RouteComponent
});

function RouteComponent() {
  useSetRampUrlParams();

  return <Ramp />;
}
