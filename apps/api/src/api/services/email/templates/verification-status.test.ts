import { describe, expect, it } from "bun:test";
import { VerificationPayload } from "../types";
import { renderVerificationStatus } from "./verification-status";

const payload = (extra: Partial<VerificationPayload> = {}): VerificationPayload => ({
  reason: null,
  updatedAt: "2026-01-15T10:00:00Z",
  ...extra
});

describe("renderVerificationStatus", () => {
  it("names identity verification for an individual", () => {
    const email = renderVerificationStatus("approved", "en-US", payload({ subject: "individual" }));

    expect(email.subject).toBe("Your Vortex identity verification was approved");
    expect(email.text).toContain("Your identity verification has been approved");
    expect(email.text).not.toContain("business");
  });

  it("names business verification for a company", () => {
    const email = renderVerificationStatus("approved", "en-US", payload({ subject: "business" }));

    expect(email.subject).toBe("Your Vortex business verification was approved");
    expect(email.text).toContain("Your business verification has been approved");
  });

  it("keeps the individual/business split in pt-BR", () => {
    const individual = renderVerificationStatus("rejected", "pt-BR", payload({ subject: "individual" }));
    const business = renderVerificationStatus("rejected", "pt-BR", payload({ subject: "business" }));

    expect(individual.subject).toBe("Sua verificação de identidade na Vortex não foi aprovada");
    expect(business.subject).toBe("Sua verificação empresarial na Vortex não foi aprovada");
  });

  // Rows queued before the split carry no subject; individual is the reading that was wrong
  // before, so it is the one an unlabelled row must fall back to.
  it("falls back to individual copy when the payload predates the subject field", () => {
    const email = renderVerificationStatus("expired", "en-US", payload());

    expect(email.subject).toBe("Your Vortex identity verification expired");
  });

  it("still carries the rejection reason and status tone", () => {
    const email = renderVerificationStatus("rejected", "en-US", payload({ reason: "Document unreadable", subject: "business" }));

    expect(email.text).toContain("Document unreadable");
    expect(email.html).toContain("Not approved");
  });

  // Spec invariant 9 (docs/security-spec/05-integrations/resend.md): the reason is
  // provider-supplied text and must never reach the HTML body as markup.
  it("escapes a hostile provider reason instead of rendering it as markup", () => {
    const hostile = `<img src=x onerror="alert(1)"> & "quotes"`;
    const email = renderVerificationStatus("rejected", "en-US", payload({ reason: hostile, subject: "individual" }));

    expect(email.html).not.toContain("<img src=x");
    expect(email.html).not.toContain("onerror=\"alert");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;quotes&quot;");
  });
});
