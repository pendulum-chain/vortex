import {
  KYC_FILE_ACCEPTED_TYPES as ACCEPTED_TYPES,
  type KybBusinessFiles,
  KYC_FILE_MAX_BYTES as MAX_FILE_SIZE
} from "@vortexfi/kyc";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MenuButtons } from "../MenuButtons";

function FileDropZone({
  fieldKey,
  label,
  file,
  onChange
}: {
  fieldKey: string;
  label: string;
  file: File | null;
  onChange: (file: File) => void;
}) {
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
        onClick={() => document.getElementById(`kyb-doc-${fieldKey}`)?.click()}
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
          id={`kyb-doc-${fieldKey}`}
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
  const [taxIdDocument, setTaxIdDocument] = useState<File | null>(null);
  const [articlesIncorporation, setArticlesIncorporation] = useState<File | null>(null);
  const [proofAddress, setProofAddress] = useState<File | null>(null);
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);

  const isValid =
    taxIdDocument !== null && articlesIncorporation !== null && proofAddress !== null && docFront !== null && docBack !== null;

  const handleSubmit = () => {
    if (!taxIdDocument || !articlesIncorporation || !proofAddress || !docFront || !docBack) return;
    onSubmit({ articlesIncorporation, docBack, docFront, proofAddress, taxIdDocument });
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.kybBusinessDocs.title")}</h1>
      <p className="mb-6 text-center text-gray-500 text-sm">{t("components.kybBusinessDocs.subtitle")}</p>

      <div className="flex grow-1 flex-col space-y-4 px-1 pb-4">
        <FileDropZone
          fieldKey="taxIdDocument"
          file={taxIdDocument}
          label={t("components.kybBusinessDocs.taxIdDocument")}
          onChange={setTaxIdDocument}
        />
        <FileDropZone
          fieldKey="articlesIncorporation"
          file={articlesIncorporation}
          label={t("components.kybBusinessDocs.articlesIncorporation")}
          onChange={setArticlesIncorporation}
        />
        <FileDropZone
          fieldKey="proofAddress"
          file={proofAddress}
          label={t("components.kybBusinessDocs.proofAddress")}
          onChange={setProofAddress}
        />
        <FileDropZone
          fieldKey="relatedPersons.docFront"
          file={docFront}
          label={t("components.kybBusinessDocs.docFront")}
          onChange={setDocFront}
        />
        <FileDropZone
          fieldKey="relatedPersons.docBack"
          file={docBack}
          label={t("components.kybBusinessDocs.docBack")}
          onChange={setDocBack}
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
