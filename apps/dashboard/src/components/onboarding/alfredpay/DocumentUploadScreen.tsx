import { KYC_FILE_ACCEPTED_TYPES, KYC_FILE_MAX_BYTES, type MxnKycFiles } from "@vortexfi/kyc";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

interface DocumentUploadScreenProps {
  /** Argentina additionally requires a selfie. */
  includeSelfie: boolean;
  /** Upload failure from the machine's previous attempt. */
  error?: string;
  onSubmit: (files: MxnKycFiles) => void;
  onBack: () => void;
}

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
          "flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          file ? "border-primary bg-primary/5" : "border-input bg-muted/40 hover:border-primary/60"
        )}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {file ? (
          <span className="max-w-full truncate text-primary text-sm">{file.name}</span>
        ) : (
          <>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadCloud className="size-4" />
            </span>
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
