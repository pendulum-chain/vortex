import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "@/App.css";
import { getRouter } from "@/router";

const router = getRouter();

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(<RouterProvider router={router} />);
