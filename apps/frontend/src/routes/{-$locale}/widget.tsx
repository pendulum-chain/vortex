import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../../pages/ramp";
import { rampSearchSchema } from "../../types/searchParams";

export const Route = createFileRoute("/{-$locale}/widget")({
  component: RouteComponent,
  validateSearch: zodValidator(rampSearchSchema)
});

function RouteComponent() {
  useSetRampUrlParams();

  return <BaseLayout main={<Ramp />} />;
}
