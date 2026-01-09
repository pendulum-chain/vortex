import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { TermsAndConditionsPage } from "../../pages/terms";

export const Route = createFileRoute("/{-$locale}/terms-and-conditions")({
  component: TermsAndConditionsRouteComponent
});

function TermsAndConditionsRouteComponent() {
  return <BaseLayout main={<TermsAndConditionsPage />} />;
}
