import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { TermsAndConditionsShortPage } from "../../pages/terms/short";

export const Route = createFileRoute("/{-$locale}/terms-and-conditions")({
  component: TermsAndConditionsShortRouteComponent
});

function TermsAndConditionsShortRouteComponent() {
  return <BaseLayout main={<TermsAndConditionsShortPage />} />;
}
