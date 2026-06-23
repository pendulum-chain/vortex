import { UploadCloud } from "lucide-react";

export function DocumentDropzone({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-input border-dashed bg-muted/40 px-4 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UploadCloud className="size-5" />
      </div>
      <p className="font-medium text-sm">{label}</p>
      <p className="text-muted-foreground text-xs">Drag & drop or click to upload (demo — no file is sent)</p>
    </div>
  );
}
