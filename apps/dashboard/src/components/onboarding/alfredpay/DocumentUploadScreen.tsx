import type { MxnKycFiles } from "@vortexfi/kyc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FileDropZone } from "./FileDropZone";

interface DocumentUploadScreenProps {
  /** Argentina additionally requires a selfie. */
  includeSelfie: boolean;
  /** Upload failure from the machine's previous attempt. */
  error?: string;
  onSubmit: (files: MxnKycFiles) => void;
  onBack: () => void;
}

export function DocumentUploadScreen({ includeSelfie, error, onSubmit, onBack }: DocumentUploadScreenProps) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const isComplete = front !== null && back !== null && (!includeSelfie || selfie !== null);

  const handleSubmit = () => {
    if (!front || !back) return;
    if (includeSelfie && !selfie) return;
    onSubmit({ back, front, selfie: selfie ?? undefined });
  };

  return (
    <>
      <div className="grid gap-4 py-2">
        <div>
          <h3 className="font-medium text-sm">Identity document</h3>
          <p className="text-muted-foreground text-sm">JPG, PNG or PDF, up to 5 MB each.</p>
        </div>

        <FileDropZone file={front} label="Front of your ID" onChange={setFront} />
        <FileDropZone file={back} label="Back of your ID" onChange={setBack} />
        {includeSelfie && <FileDropZone file={selfie} label="Selfie" onChange={setSelfie} />}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <DialogFooter>
        <Button onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button disabled={!isComplete} onClick={handleSubmit}>
          Submit documents
        </Button>
      </DialogFooter>
    </>
  );
}
