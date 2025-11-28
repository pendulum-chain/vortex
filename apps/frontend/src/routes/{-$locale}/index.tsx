import { createFileRoute } from "@tanstack/react-router";
import { Main } from "../../pages/main";

export const Route = createFileRoute("/{-$locale}/")({
  component: RouteComponent
});

function RouteComponent() {
  return <Main />;
}
