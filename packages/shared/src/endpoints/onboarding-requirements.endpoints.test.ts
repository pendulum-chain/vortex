import { describe, expect, test } from "bun:test";
import { ONBOARDING_REQUIREMENTS } from "./onboarding-requirements.endpoints";

describe("ONBOARDING_REQUIREMENTS", () => {
  test("publishes every supported product flow", () => {
    expect(Object.fromEntries(Object.entries(ONBOARDING_REQUIREMENTS).map(([country, flows]) => [country, Object.keys(flows).sort()]))).toEqual({
      AR: ["individual"],
      BR: ["business", "individual"],
      CO: ["business", "individual"],
      MX: ["business", "individual"],
      US: ["business", "individual"]
    });
  });

  test("uses unique ordered steps and OpenAPI component references without duplicating request fields", () => {
    for (const flows of Object.values(ONBOARDING_REQUIREMENTS)) {
      for (const requirements of Object.values(flows)) {
        expect(requirements).toBeDefined();
        if (!requirements) continue;

        expect("fields" in requirements).toBe(false);
        expect(requirements.steps.some(step => step.method === "GET")).toBe(false);
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
    expect(ONBOARDING_REQUIREMENTS.US.business?.documents).toEqual([]);
    expect(ONBOARDING_REQUIREMENTS.BR.individual?.mode).toBe("hybrid");
  });

  test("includes fixed provider discriminators needed to execute action steps", () => {
    const mxBusinessCreation = ONBOARDING_REQUIREMENTS.MX.business?.steps.find(
      step => step.operationId === "createDomesticBusinessCustomer"
    );
    expect(mxBusinessCreation?.fixedBody).toEqual({ country: "MX" });

    const usBusinessOpened = ONBOARDING_REQUIREMENTS.US.business?.steps.find(
      step => step.operationId === "notifyDomesticKycRedirectOpened"
    );
    expect(usBusinessOpened?.fixedBody).toEqual({ country: "US", type: "BUSINESS" });
  });

  test("returns the complete Avenia business operation sequence", () => {
    expect(ONBOARDING_REQUIREMENTS.BR.business?.steps.map(step => step.operationId ?? step.kind)).toEqual([
      "createSubaccount",
      "createBrKybDocument",
      "direct-upload",
      "hosted",
      "createBrKybUbo",
      "submitBrKybLevel1Api"
    ]);
  });
});
