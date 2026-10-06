import type { KybBusinessFiles } from "@vortexfi/kyc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FileDropZone } from "./FileDropZone";

interface KybDocumentUploadScreenProps {
  error?: string;
  /** Answered on the questionnaire step; Alfredpay then also requires a licence and AML policy. */
  isRegulatedBusiness?: boolean;
  onBack: () => void;
  onSubmit: (files: KybBusinessFiles) => void;
}

export function KybDocumentUploadScreen({ error, isRegulatedBusiness, onBack, onSubmit }: KybDocumentUploadScreenProps) {
  const [taxIdDocument, setTaxIdDocument] = useState<File | null>(null);
  const [articlesIncorporation, setArticlesIncorporation] = useState<File | null>(null);
  const [proofAddress, setProofAddress] = useState<File | null>(null);
  const [shareholderRegistry, setShareholderRegistry] = useState<File | null>(null);
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);
  const [businessLicense, setBusinessLicense] = useState<File | null>(null);
  const [uploadAmlPolicy, setUploadAmlPolicy] = useState<File | null>(null);
  const regulatedComplete = !isRegulatedBusiness || (!!businessLicense && !!uploadAmlPolicy);
  const complete =
    !!taxIdDocument &&
    !!articlesIncorporation &&
    !!proofAddress &&
    !!shareholderRegistry &&
    !!docFront &&
    !!docBack &&
    regulatedComplete;

  const handleSubmit = () => {
    if (!taxIdDocument || !articlesIncorporation || !proofAddress || !shareholderRegistry || !docFront || !docBack) return;
    if (!regulatedComplete) return;
    onSubmit({
      articlesIncorporation,
      // Sent only on the regulated branch — Alfredpay rejects the submission without them there.
      businessLicense: isRegulatedBusiness ? (businessLicense ?? undefined) : undefined,
      docBack,
      docFront,
      proofAddress,
      shareholderRegistry,
      taxIdDocument,
      uploadAmlPolicy: isRegulatedBusiness ? (uploadAmlPolicy ?? undefined) : undefined
    });
  };

  return (
    <>
      <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">
        <div>
          <h3 className="font-medium">Company and representative documents</h3>
          <p className="text-muted-foreground text-sm">
            {isRegulatedBusiness ? "All eight files are required." : "All six files are required."} JPG, PNG or PDF, up to 5 MB
            each.
          </p>
        </div>
        <FileDropZone compact file={taxIdDocument} label="Tax ID document" onChange={setTaxIdDocument} />
        <FileDropZone
          compact
          file={articlesIncorporation}
          label="Articles of incorporation"
          onChange={setArticlesIncorporation}
        />
        <FileDropZone compact file={proofAddress} label="Proof of business address" onChange={setProofAddress} />
        <FileDropZone compact file={shareholderRegistry} label="Shareholder registry" onChange={setShareholderRegistry} />
        {isRegulatedBusiness && (
          <>
            <FileDropZone compact file={businessLicense} label="Business licence" onChange={setBusinessLicense} />
            <FileDropZone compact file={uploadAmlPolicy} label="AML policy" onChange={setUploadAmlPolicy} />
          </>
        )}
        <FileDropZone compact file={docFront} label="Representative ID, front" onChange={setDocFront} />
        <FileDropZone compact file={docBack} label="Representative ID, back" onChange={setDocBack} />
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter className="pt-4">
        <Button onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button disabled={!complete} onClick={handleSubmit}>
          Submit documents
        </Button>
      </DialogFooter>
    </>
  );
}
