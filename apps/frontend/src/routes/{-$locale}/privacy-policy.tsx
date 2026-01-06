import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { PrivacyPolicyPage } from "../../pages/privacy";

export const Route = createFileRoute("/{-$locale}/privacy-policy")({
  component: PrivacyPolicyRouteComponent
});

function PrivacyPolicyRouteComponent() {
  return <BaseLayout main={<PrivacyPolicyPage />} />;
}
