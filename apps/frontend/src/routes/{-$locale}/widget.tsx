import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../../pages/ramp";
import { rampSearchSchema } from "../../types/searchParams";

export const Route = createFileRoute("/{-$locale}/widget")({
  component: RouteComponent,
  // The ramp flow is driven by wallet SDKs and persisted machine state that only exist in the
  // browser, so it renders from the SPA shell instead of being server-rendered.
  ssr: false,
  validateSearch: zodValidator(rampSearchSchema)
});

function RouteComponent() {
  useSetRampUrlParams();

  return <BaseLayout main={<Ramp />} />;
}
