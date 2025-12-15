import { createFileRoute } from "@tanstack/react-router";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../../pages/ramp";
import { validateRampSearchParams } from "../../types/searchParams";

export const Route = createFileRoute("/{-$locale}/widget")({
  component: RouteComponent,
  validateSearch: validateRampSearchParams
});

function RouteComponent() {
  useSetRampUrlParams();

  return <BaseLayout main={<Ramp />} />;
}
