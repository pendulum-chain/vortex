import type { CorridorId, OnboardingKind } from "@/domain/types";
import type { WizardStep } from "./types";

/** Company KYB collects entity + representative + documents (all headless corridors). */
const KYB_STEPS: WizardStep[] = [
  { description: "Legal entity and registration number.", id: "companyInfo", title: "Company details" },
  { description: "Person legally acting for the company.", id: "representative", title: "Authorized representative" },
  { description: "Articles of incorporation and proof of address.", id: "documents", title: "Company documents" }
];

/** Standard individual KYC: personal details + documents. */
const KYC_STEPS: WizardStep[] = [
  { description: "Your name, tax ID and date of birth.", id: "personalInfo", title: "Personal details" },
  { description: "Upload an ID and proof of address.", id: "documents", title: "Identity & proof of address" }
];

/** Brazil (Avenia) additionally runs a liveness selfie check. */
const BRAZIL_KYC_STEPS: WizardStep[] = [
  { description: "Your name, CPF and date of birth.", id: "personalInfo", title: "Personal details" },
  { description: "Upload both sides of your ID or CNH.", id: "documents", title: "Identity document" },
  { description: "Confirm it's really you with a quick selfie.", id: "liveness", title: "Liveness check" }
];

/** Steps for a headless onboarding. Google-Form and redirect routes don't use these. */
export function getOnboardingSteps(corridorId: CorridorId, kind: OnboardingKind): WizardStep[] {
  if (kind === "kyb") {
    return KYB_STEPS;
  }
  return corridorId === "BR" ? BRAZIL_KYC_STEPS : KYC_STEPS;
}
