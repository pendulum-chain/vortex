import { describe, expect, test } from "bun:test";
import { ONBOARDING_REQUIREMENTS } from "./onboarding-requirements.endpoints";

describe("ONBOARDING_REQUIREMENTS", () => {
  test("publishes every supported Avenia and Alfredpay product flow", () => {
    expect(Object.fromEntries(Object.entries(ONBOARDING_REQUIREMENTS).map(([country, flows]) => [country, Object.keys(flows).sort()]))).toEqual({
      AR: ["individual"],
      BR: ["business", "individual"],
      CO: ["business", "individual"],
      MX: ["business", "individual"],
      US: ["business", "individual"]
    });
  });

  test("uses unique ordered steps and OpenAPI component references", () => {
    for (const flows of Object.values(ONBOARDING_REQUIREMENTS)) {
      for (const requirements of Object.values(flows)) {
        expect(requirements).toBeDefined();
        if (!requirements) continue;

        expect(requirements.steps.map(step => step.order)).toEqual(
          Array.from({ length: requirements.steps.length }, (_, index) => index + 1)
        );
        for (const step of requirements.steps) {
          if (step.kind === "api") expect(step.operationId).toBeString();
          if (step.requestSchema) expect(step.requestSchema).toStartWith("#/components/schemas/");
        }
      }
    }
  });

  test("keeps provider-hosted collection explicit", () => {
    expect(ONBOARDING_REQUIREMENTS.US.individual?.mode).toBe("hosted");
    expect(ONBOARDING_REQUIREMENTS.US.business?.fields).toEqual([]);
    expect(ONBOARDING_REQUIREMENTS.BR.individual?.mode).toBe("hybrid");
  });

  test("includes fixed provider discriminators needed to execute business flows", () => {
    const mxBusinessStatus = ONBOARDING_REQUIREMENTS.MX.business?.steps.find(
      step => step.operationId === "getAlfredpayKycStatus"
    );
    expect(mxBusinessStatus?.fixedQuery).toEqual({ country: "MX", type: "BUSINESS" });

    const usBusinessOpened = ONBOARDING_REQUIREMENTS.US.business?.steps.find(
      step => step.operationId === "notifyAlfredpayKycRedirectOpened"
    );
    expect(usBusinessOpened?.fixedBody).toEqual({ country: "US", type: "BUSINESS" });

    const brBusinessFields = ONBOARDING_REQUIREMENTS.BR.business?.fields.map(field => field.path);
    expect(brBusinessFields).toContain("fullName");
    expect(brBusinessFields).not.toContain("ubo.fullName");
  });
});
