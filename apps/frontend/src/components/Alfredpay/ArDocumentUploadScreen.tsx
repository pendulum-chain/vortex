import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArKycFiles } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

interface ArDocumentUploadScreenProps {
  onSubmit: (files: ArKycFiles) => void;
}

function FileDropZone({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(t("components.arDocumentUpload.invalidType"));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError(t("components.arDocumentUpload.fileTooLarge"));
      return;
    }
    onChange(f);
  };

  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">{label}</p>
      <button
        className={`flex min-h-[88px] w-full cursor-pointer touch-manipulation flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors ${
          file ? "border-primary bg-primary/5" : "border-neutral-300 bg-base-200 [@media(hover:hover)]:hover:border-primary/60"
        }`}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {file ? (
          <span className="max-w-full truncate text-primary text-sm">{file.name}</span>
        ) : (
          <span className="text-gray-400 text-sm">{t("components.arDocumentUpload.tapToSelect")}</span>
        )}
        <input
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          ref={inputRef}
          type="file"
        />
      </button>
      {error && <p className="text-error text-xs">{error}</p>}
    </div>
  );
}

export function ArDocumentUploadScreen({ onSubmit }: ArDocumentUploadScreenProps) {
  const { t } = useTranslation();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const isValid = front !== null && back !== null && selfie !== null;

  const handleSubmit = () => {
    if (!front || !back || !selfie) return;
    onSubmit({ back, front, selfie });
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.arDocumentUpload.title")}</h1>
      <p className="mb-6 text-center text-gray-500 text-sm">{t("components.arDocumentUpload.subtitle")}</p>

      <div className="flex grow-1 flex-col space-y-4 px-1 pb-4">
        <FileDropZone file={front} label={t("components.arDocumentUpload.frontLabel")} onChange={setFront} />
        <FileDropZone file={back} label={t("components.arDocumentUpload.backLabel")} onChange={setBack} />
        <FileDropZone file={selfie} label={t("components.arDocumentUpload.selfieLabel")} onChange={setSelfie} />

        <p className="text-center text-gray-400 text-xs">{t("components.arDocumentUpload.fileHint")}</p>

        <button className="btn btn-vortex-primary w-full" disabled={!isValid} onClick={handleSubmit} type="button">
          {t("components.arDocumentUpload.submit")}
        </button>
      </div>
    </div>
  );
}
