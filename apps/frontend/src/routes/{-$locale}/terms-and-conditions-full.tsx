import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { TermsAndConditionsFullPage } from "../../pages/terms/full";

export const Route = createFileRoute("/{-$locale}/terms-and-conditions-full")({
  component: TermsAndConditionsFullRouteComponent
});

function TermsAndConditionsFullRouteComponent() {
  return <BaseLayout main={<TermsAndConditionsFullPage />} />;
}
