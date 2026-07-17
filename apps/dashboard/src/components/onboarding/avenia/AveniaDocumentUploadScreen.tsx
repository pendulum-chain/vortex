import type { UploadIds } from "@vortexfi/kyc";
import { AveniaDocumentType } from "@vortexfi/shared";
import { CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { BrlaService } from "@/services/api/brla.service";

interface AveniaDocumentUploadScreenProps {
  onBack: () => void;
  onSubmit: (uploadIds: UploadIds) => void;
  taxId: string;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

async function uploadFile(file: File, url: string) {
  const response = await fetch(url, {
    body: await file.arrayBuffer(),
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "If-None-Match": "*"
    },
    method: "PUT"
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}

export function AveniaDocumentUploadScreen({ onBack, onSubmit, taxId }: AveniaDocumentUploadScreenProps) {
  const [docType, setDocType] = useState<AveniaDocumentType>(AveniaDocumentType.DRIVERS_LICENSE);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const requiresBack = docType === AveniaDocumentType.ID;
  const canSubmit = !!taxId && !!front && (!requiresBack || !!back) && !isUploading;

  const handleSubmit = async () => {
    if (!front || (requiresBack && !back)) return;

    setError(null);
    setIsUploading(true);
    try {
      const response = await BrlaService.getUploadUrls({ documentType: docType, taxId });
      const uploads = [uploadFile(front, response.idUpload.uploadURLFront)];

      if (requiresBack) {
        if (!back || !response.idUpload.uploadURLBack) {
          throw new Error("Avenia did not return a back-side upload URL.");
        }
        uploads.push(uploadFile(back, response.idUpload.uploadURLBack));
      }

      await Promise.all(uploads);
      onSubmit({
        livenessUrl: response.selfieUpload.livenessUrl ?? "",
        uploadedDocumentId: response.idUpload.id,
        uploadedSelfieId: response.selfieUpload.id
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload documents.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 py-2">
        <div>
          <h3 className="font-medium text-sm">Upload identity documents</h3>
          <p className="text-muted-foreground text-sm">Files are uploaded directly to Avenia using provider upload URLs.</p>
        </div>

        <div className="grid gap-2">
          <Label>Document type</Label>
          <Select
            onValueChange={value => {
              setDocType(value as AveniaDocumentType);
              setFront(null);
              setBack(null);
              setError(null);
            }}
            value={docType}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AveniaDocumentType.DRIVERS_LICENSE}>Driver's license (CNH)</SelectItem>
              <SelectItem value={AveniaDocumentType.ID}>Identity card (RG)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FileUploadCard
          file={front}
          label={requiresBack ? "Front of identity document" : "Driver's license"}
          onChange={setFront}
        />
        {requiresBack && <FileUploadCard file={back} label="Back of identity document" onChange={setBack} />}

        {!taxId && <p className="text-destructive text-sm">Tax ID is missing. Go back and enter your CPF again.</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <DialogFooter>
        <Button disabled={isUploading} onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button disabled={!canSubmit} onClick={handleSubmit}>
          {isUploading ? <Loader2 className="size-4 animate-spin" /> : null}
          {isUploading ? "Uploading..." : "Continue to face verification"}
        </Button>
      </DialogFooter>
    </>
  );
}

function FileUploadCard({
  file,
  label,
  onChange
}: {
  file: File | null;
  label: string;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const handleFile = (candidate: File) => {
    if (!ALLOWED_TYPES.includes(candidate.type)) {
      setRejected("Use a JPG, PNG, or PDF file.");
      onChange(null);
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setRejected("That file is over 15 MB.");
      onChange(null);
      return;
    }

    setRejected(null);
    onChange(candidate);
  };

  return (
    <div className="grid gap-1.5">
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-left transition-colors",
          file ? "border-primary bg-primary/5" : "border-input bg-muted/40 hover:border-primary/60"
        )}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {file ? <CheckCircle2 className="size-5" /> : <UploadCloud className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{label}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {file ? file.name : "JPG, PNG, or PDF, up to 15 MB."}
          </span>
        </span>
        <FileText className="size-4 text-muted-foreground" />
        <input
          accept={ALLOWED_TYPES.join(",")}
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
