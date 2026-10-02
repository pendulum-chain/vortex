// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import "../test/i18n";
import { API_BASE_URL, server } from "../test/msw-server";

// Only the maintenance wiring is under test; stub the layout's unrelated chrome and hooks.
vi.mock("../components/Navbar", () => ({ Navbar: () => null }));
vi.mock("../components/Footer", () => ({ Footer: () => null }));
vi.mock("../components/Stepper", () => ({ default: () => null }));
vi.mock("../hooks/useInitTokenBalances", () => ({ useInitTokenBalances: () => undefined }));
vi.mock("../hooks/useStepper", () => ({ useStepper: () => ({ steps: [] }) }));
vi.mock("../hooks/useWidgetMode", () => ({ useWidgetMode: () => false }));
vi.mock("../hooks/ramp/useIsQuoteComponentDisplayed", () => ({ useIsQuoteComponentDisplayed: () => false }));

import { BaseLayout } from "./index";

describe("BaseLayout", () => {
  it("fetches the maintenance status on mount and shows an active maintenance banner", async () => {
    server.use(
      http.get(`${API_BASE_URL}/maintenance/status`, () =>
        HttpResponse.json({
          is_maintenance_active: true,
          maintenance_details: {
            end_datetime: "2026-10-02T12:00:00Z",
            message: "Ramps are paused while we upgrade.",
            start_datetime: "2026-10-02T10:00:00Z",
            title: "Scheduled maintenance"
          }
        })
      )
    );

    render(<BaseLayout main={<div />} />);

    expect(await screen.findByText("Scheduled maintenance")).toBeTruthy();
  });
});
