import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// "bypass" keeps pre-existing node-environment tests untouched: any request they make
// behaves exactly as before this setup file existed.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
