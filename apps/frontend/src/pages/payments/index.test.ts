import { describe, expect, it } from "vitest";
import { buildPaymentsInquiry, PaymentsRouteSummaryData } from "./paymentsLeadPayload";

describe("buildPaymentsInquiry", () => {
  it("bundles route fields into the contact inquiry payload", () => {
    const data: PaymentsRouteSummaryData = {
      country: "Brazil",
      payoutCurrency: "BRL",
      receiveCurrency: "USDC",
      useCase: "Service exporter",
      volume: "50k to 250k"
    };

    expect(buildPaymentsInquiry(data)).toBe(
      [
        "Payments route comparison request",
        "",
        "Monthly volume: 50k to 250k",
        "Receive currency: USDC",
        "Payout currency: BRL",
        "Country: Brazil",
        "Use case: Service exporter"
      ].join("\n")
    );
  });
});
