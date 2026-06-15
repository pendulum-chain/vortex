import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MxnKycFiles } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

interface MxnDocumentUploadScreenProps {
  error?: string;
  i18nNamespace?: string;
  includeSelfie?: boolean;
  onSubmit: (files: MxnKycFiles) => void;
}

function FileDropZone({
  i18nNamespace,
  label,
  file,
  onChange
}: {
  i18nNamespace: string;
  label: string;
  file: File | null;
  onChange: (file: File) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(t(`${i18nNamespace}.invalidType`));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError(t(`${i18nNamespace}.fileTooLarge`));
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
          <span className="text-gray-400 text-sm">{t(`${i18nNamespace}.tapToSelect`)}</span>
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

export function MxnDocumentUploadScreen({
  error,
  i18nNamespace = "components.mxnDocumentUpload",
  onSubmit,
  includeSelfie = false
}: MxnDocumentUploadScreenProps) {
  const { t } = useTranslation();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const isValid = front !== null && back !== null && (!includeSelfie || selfie !== null);

  const handleSubmit = () => {
    if (!front || !back) return;
    if (includeSelfie && !selfie) return;
    onSubmit({ back, front, selfie: selfie ?? undefined });
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t(`${i18nNamespace}.title`)}</h1>
      <p className="mb-6 text-center text-gray-500 text-sm">{t(`${i18nNamespace}.subtitle`)}</p>

      <div className="flex grow-1 flex-col space-y-4 px-1 pb-4">
        <FileDropZone file={front} i18nNamespace={i18nNamespace} label={t(`${i18nNamespace}.frontLabel`)} onChange={setFront} />
        <FileDropZone file={back} i18nNamespace={i18nNamespace} label={t(`${i18nNamespace}.backLabel`)} onChange={setBack} />
        {includeSelfie && (
          <FileDropZone
            file={selfie}
            i18nNamespace={i18nNamespace}
            label={t(`${i18nNamespace}.selfieLabel`)}
            onChange={setSelfie}
          />
        )}

        <p className="text-center text-gray-400 text-xs">{t(`${i18nNamespace}.fileHint`)}</p>

        {error && <p className="text-center text-error text-xs">{error}</p>}

        <button className="btn btn-vortex-primary w-full" disabled={!isValid} onClick={handleSubmit} type="button">
          {t(`${i18nNamespace}.submit`)}
        </button>
      </div>
    </div>
  );
}
