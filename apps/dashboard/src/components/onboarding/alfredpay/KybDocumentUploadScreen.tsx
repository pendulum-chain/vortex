import { KYC_FILE_ACCEPTED_TYPES, KYC_FILE_MAX_BYTES, type KybBusinessFiles } from "@vortexfi/kyc";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

function FileDropZone({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const handleFile = (candidate: File) => {
    if (!KYC_FILE_ACCEPTED_TYPES.includes(candidate.type)) {
      setRejected("Use a JPG, PNG or PDF file.");
      return;
    }
    if (candidate.size > KYC_FILE_MAX_BYTES) {
      setRejected("That file is over 5 MB.");
      return;
    }
    setRejected(null);
    onChange(candidate);
  };

  return (
    <div className="grid gap-1.5">
      <p className="font-medium text-sm">{label}</p>
      <button
        className={cn(
          "flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-center transition-colors",
          file ? "border-primary bg-primary/5" : "border-input bg-muted/40 hover:border-primary/60"
        )}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {file ? (
          <span className="max-w-full truncate text-primary text-sm">{file.name}</span>
        ) : (
          <>
            <UploadCloud className="size-4 text-primary" />
            <span className="text-muted-foreground text-sm">Click to select a file</span>
          </>
        )}
        <input
          accept={KYC_FILE_ACCEPTED_TYPES.join(",")}
          className="sr-only"
          onChange={event => {
            const selected = event.target.files?.[0];
            if (selected) handleFile(selected);
          }}
          ref={inputRef}
          type="file"
        />
      </button>
      {rejected && <p className="text-destructive text-xs">{rejected}</p>}
    </div>
  );
}

interface KybDocumentUploadScreenProps {
  error?: string;
  onBack: () => void;
  onSubmit: (files: KybBusinessFiles) => void;
}

export function KybDocumentUploadScreen({ error, onBack, onSubmit }: KybDocumentUploadScreenProps) {
  const [taxIdDocument, setTaxIdDocument] = useState<File | null>(null);
  const [articlesIncorporation, setArticlesIncorporation] = useState<File | null>(null);
  const [proofAddress, setProofAddress] = useState<File | null>(null);
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);
  const complete = !!taxIdDocument && !!articlesIncorporation && !!proofAddress && !!docFront && !!docBack;

  const handleSubmit = () => {
    if (!taxIdDocument || !articlesIncorporation || !proofAddress || !docFront || !docBack) return;
    onSubmit({ articlesIncorporation, docBack, docFront, proofAddress, taxIdDocument });
  };

  return (
    <>
      <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">
        <div>
          <h3 className="font-medium">Company and representative documents</h3>
          <p className="text-muted-foreground text-sm">All five files are required. JPG, PNG or PDF, up to 5 MB each.</p>
        </div>
        <FileDropZone file={taxIdDocument} label="Tax ID document" onChange={setTaxIdDocument} />
        <FileDropZone file={articlesIncorporation} label="Articles of incorporation" onChange={setArticlesIncorporation} />
        <FileDropZone file={proofAddress} label="Proof of business address" onChange={setProofAddress} />
        <FileDropZone file={docFront} label="Representative ID, front" onChange={setDocFront} />
        <FileDropZone file={docBack} label="Representative ID, back" onChange={setDocBack} />
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
