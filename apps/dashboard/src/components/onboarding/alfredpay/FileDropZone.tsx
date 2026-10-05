import { KYC_FILE_ACCEPTED_TYPES, KYC_FILE_MAX_BYTES } from "@vortexfi/kyc";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface FileDropZoneProps {
  /** Tighter box without the icon bubble, for the longer KYB document list. */
  compact?: boolean;
  file: File | null;
  label: string;
  onChange: (file: File) => void;
}

export function FileDropZone({ compact = false, label, file, onChange }: FileDropZoneProps) {
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
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center transition-colors",
          compact ? "min-h-20 py-4" : "min-h-[88px] py-6",
          file ? "border-primary bg-primary/5" : "border-input bg-muted/40 hover:border-primary/60"
        )}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {file ? (
          <span className="max-w-full truncate text-primary text-sm">{file.name}</span>
        ) : (
          <>
            {compact ? (
              <UploadCloud className="size-4 text-primary" />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="size-4" />
              </span>
            )}
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
