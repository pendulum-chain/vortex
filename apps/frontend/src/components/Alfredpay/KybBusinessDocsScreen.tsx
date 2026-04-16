import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { KybBusinessFiles } from "../../machines/alfredpayKyc.machine";
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
        onClick={() => document.getElementById(`kyb-doc-${label}`)?.click()}
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
          id={`kyb-doc-${label}`}
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

interface KybBusinessDocsScreenProps {
  onBack: () => void;
  onSubmit: (files: KybBusinessFiles) => void;
}

export function KybBusinessDocsScreen({ onBack, onSubmit }: KybBusinessDocsScreenProps) {
  const { t } = useTranslation();
  const [articlesIncorporation, setArticlesIncorporation] = useState<File | null>(null);
  const [proofAddress, setProofAddress] = useState<File | null>(null);
  const [shareholderRegistry, setShareholderRegistry] = useState<File | null>(null);

  const isValid = articlesIncorporation !== null && proofAddress !== null && shareholderRegistry !== null;

  const handleSubmit = () => {
    if (!articlesIncorporation || !proofAddress || !shareholderRegistry) return;
    onSubmit({ articlesIncorporation, proofAddress, shareholderRegistry });
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.kybBusinessDocs.title")}</h1>
      <p className="mb-6 text-center text-gray-500 text-sm">{t("components.kybBusinessDocs.subtitle")}</p>

      <div className="flex grow-1 flex-col space-y-4 px-1 pb-4">
        <FileDropZone
          file={articlesIncorporation}
          label={t("components.kybBusinessDocs.articlesIncorporation")}
          onChange={setArticlesIncorporation}
        />
        <FileDropZone file={proofAddress} label={t("components.kybBusinessDocs.proofAddress")} onChange={setProofAddress} />
        <FileDropZone
          file={shareholderRegistry}
          label={t("components.kybBusinessDocs.shareholderRegistry")}
          onChange={setShareholderRegistry}
        />

        <p className="text-center text-gray-400 text-xs">{t("components.mxnDocumentUpload.fileHint")}</p>

        <button className="btn btn-vortex-primary w-full" disabled={!isValid} onClick={handleSubmit} type="button">
          {t("components.kybBusinessDocs.submit")}
        </button>
        <button className="btn btn-vortex-accent w-full" onClick={onBack} type="button">
          {t("components.alfredpayKycFlow.cancel")}
        </button>
      </div>
    </div>
  );
}
