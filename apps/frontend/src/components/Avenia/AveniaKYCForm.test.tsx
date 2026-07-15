// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AveniaKycActorRef, SelectedAveniaData } from "../../machines/types";
import "../../test/i18n";
import { AveniaKYCForm } from "./AveniaKYCForm";

const mocks = vi.hoisted(() => ({
  useAveniaKycActor: vi.fn(),
  useAveniaKycSelector: vi.fn()
}));

vi.mock("../../contexts/rampState", () => ({
  useAveniaKycActor: mocks.useAveniaKycActor,
  useAveniaKycSelector: mocks.useAveniaKycSelector
}));

vi.mock("../MenuButtons", () => ({ MenuButtons: () => null }));

function mockAveniaState(context: Record<string, unknown>) {
  mocks.useAveniaKycActor.mockReturnValue({ send: vi.fn() } as unknown as AveniaKycActorRef);
  mocks.useAveniaKycSelector.mockReturnValue({ context, stateValue: "FormFilling" } as unknown as SelectedAveniaData);
}

describe("AveniaKYCForm", () => {
  it("renders nothing when there is neither a quote-supplied tax ID nor a kybLink", () => {
    mockAveniaState({ taxId: "" });

    const { container } = render(<AveniaKYCForm />);

    expect(container.firstChild).toBeNull();
  });

  // Regression: an individual BR invite deep link arrives with no quote (taxId === ""), and used to
  // render a blank page instead of the KYC form that collects the CPF.
  it("renders the CPF form for a quote-less invite deep link (kybLink set, empty taxId)", () => {
    mockAveniaState({ kybLink: { customerType: "individual", invite: "invite-token" }, taxId: "" });

    render(<AveniaKYCForm />);

    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
  });

  it("still renders the form for the quoted flow with a pre-supplied tax ID", () => {
    mockAveniaState({ taxId: "529.982.247-25" });

    render(<AveniaKYCForm />);

    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
  });
});
