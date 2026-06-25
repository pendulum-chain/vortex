import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentDropzone } from "./DocumentDropzone";

/**
 * Visual-only mock fields per wizard step. Nothing is submitted — the wizard
 * is driven by its state machine, these inputs just make the flow feel real.
 */
export function WizardStepFields({ stepId }: { stepId: string }) {
  switch (stepId) {
    case "companyInfo":
      return (
        <div className="grid gap-4">
          <Field label="Legal company name" placeholder="Nordwind Logística Ltda" />
          <Field label="Registration number" placeholder="12.345.678/0001-90" />
          <Field label="Trade name" placeholder="Nordwind" />
        </div>
      );
    case "representative":
      return (
        <div className="grid gap-4">
          <Field label="Representative full name" placeholder="João Pereira" />
          <Field label="Representative tax ID" placeholder="123.456.789-00" />
          <Field label="Role" placeholder="Director" />
        </div>
      );
    case "personalInfo":
      return (
        <div className="grid gap-4">
          <Field label="Full name" placeholder="Maria Oliveira" />
          <Field label="Tax ID" placeholder="123.456.789-00" />
          <Field label="Date of birth" type="date" />
        </div>
      );
    case "documents":
      return (
        <div className="grid gap-3">
          <DocumentDropzone label="Identity document (front & back)" />
          <DocumentDropzone label="Proof of address" />
        </div>
      );
    case "liveness":
      return (
        <div className="grid gap-3">
          <DocumentDropzone label="Selfie liveness capture" />
        </div>
      );
    default:
      return null;
  }
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder?: string; type?: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input placeholder={placeholder} type={type} />
    </div>
  );
}
