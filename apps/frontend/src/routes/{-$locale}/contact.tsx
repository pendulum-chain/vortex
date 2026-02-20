import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { ContactPage } from "../../pages/contact";

export const Route = createFileRoute("/{-$locale}/contact")({
  component: ContactRouteComponent
});

function ContactRouteComponent() {
  return <BaseLayout main={<ContactPage />} />;
}
