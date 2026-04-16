import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { KybPersonFiles } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

function FileDropZone({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File) => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(t("components.mxnDocumentUpload.invalidType"));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError(t("components.mxnDocumentUpload.fileTooLarge"));
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
        onClick={() => document.getElementById(`kyb-person-doc-${label}`)?.click()}
        type="button"
      >
        {file ? (
          <span className="max-w-full truncate text-primary text-sm">{file.name}</span>
        ) : (
          <span className="text-gray-400 text-sm">{t("components.mxnDocumentUpload.tapToSelect")}</span>
        )}
        <input
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          id={`kyb-person-doc-${label}`}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          type="file"
        />
      </button>
      {error && <p className="text-error text-xs">{error}</p>}
    </div>
  );
}

interface KybPersonDocsScreenProps {
  currentIndex: number;
  onBack: () => void;
  onSubmit: (files: KybPersonFiles) => void;
  totalPersons: number;
}

export function KybPersonDocsScreen({ currentIndex, totalPersons, onBack, onSubmit }: KybPersonDocsScreenProps) {
  const { t } = useTranslation();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const isValid = front !== null && back !== null;

  const handleSubmit = () => {
    if (!front || !back) return;
    onSubmit({ back, front });
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">
        {t("components.kybPersonDocs.title", { current: currentIndex + 1, total: totalPersons })}
      </h1>
      <p className="mb-6 text-center text-gray-500 text-sm">{t("components.kybPersonDocs.subtitle")}</p>

      <div className="flex grow-1 flex-col space-y-4 px-1 pb-4">
        <FileDropZone file={front} label={t("components.mxnDocumentUpload.frontLabel")} onChange={setFront} />
        <FileDropZone file={back} label={t("components.mxnDocumentUpload.backLabel")} onChange={setBack} />

        <p className="text-center text-gray-400 text-xs">{t("components.mxnDocumentUpload.fileHint")}</p>

        <button className="btn btn-vortex-primary w-full" disabled={!isValid} onClick={handleSubmit} type="button">
          {t("components.kybPersonDocs.submit")}
        </button>
        <button className="btn btn-vortex-accent w-full" onClick={onBack} type="button">
          {t("components.alfredpayKycFlow.cancel")}
        </button>
      </div>
    </div>
  );
}
