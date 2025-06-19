import { CameraIcon, CheckCircleIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { BrlaKYCDocType } from "@packages/shared";
import { motion } from "motion/react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMaintenanceAwareButton } from "../../../hooks/useMaintenanceAware";
import { BrlaService } from "../../../services/api";
import { KycLevel2Toggle } from "../../KycLevel2Toggle";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

interface DocumentUploadProps {
  onSubmitHandler: () => void;
  onBackClick: () => void;
  taxId: string;
}

async function uploadFileAsBuffer(file: File, url: string) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const res = await fetch(url, {
    body: arrayBuffer,
    headers: {
      "Content-Length": String(uint8.length),
      "Content-Type": file.type
    },
    method: "PUT"
  });

  if (!res.ok) {
    console.log("upload failed", res.statusText);
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onSubmitHandler, onBackClick, taxId }) => {
  const { t } = useTranslation();
  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton();

  const [docType, setDocType] = useState<BrlaKYCDocType>(BrlaKYCDocType.RG);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const [selfieValid, setSelfieValid] = useState(false);
  const [frontValid, setFrontValid] = useState(false);
  const [backValid, setBackValid] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  if (!taxId) {
    console.error("Tax ID is not available");
    return null;
  }

  const validateAndSetFile = (
    file: File | null,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    validSetter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!file) {
      setter(null);
      validSetter(false);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t("components.documentUpload.validation.invalidFileType"));
      setter(null);
      validSetter(false);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t("components.documentUpload.validation.fileSizeExceeded", { max: "15 MB" }));
      setter(null);
      validSetter(false);
      return;
    }
    setError("");
    setter(file);
    validSetter(true);
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    validSetter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const file = e.target.files?.[0] || null;
    validateAndSetFile(file, setter, validSetter);
  };

  const isSubmitDisabled = loading || !selfieValid || (docType === BrlaKYCDocType.RG ? !frontValid || !backValid : !frontValid);

  const handleSubmit = async () => {
    setError("");
    if (
      !selfieValid ||
      (docType === BrlaKYCDocType.RG && (!frontValid || !backValid)) ||
      (docType === BrlaKYCDocType.CNH && !frontValid)
    ) {
      setError(t("components.documentUpload.validation.validationError"));
      return;
    }
    setLoading(true);
    try {
      const response = await BrlaService.startKYC2({
        documentType: docType,
        taxId
      });

      const uploads: Promise<void>[] = [];
      if (docType === BrlaKYCDocType.RG) {
        if (!selfie || !front || !back) {
          setError(t("components.documentUpload.uploadBug"));
          console.error("Validation flags were true, but file data is missing. This is a bug.");
          return;
        }
        uploads.push(
          uploadFileAsBuffer(selfie, response.uploadUrls.selfieUploadUrl),
          uploadFileAsBuffer(front, response.uploadUrls.RGFrontUploadUrl),
          uploadFileAsBuffer(back, response.uploadUrls.RGBackUploadUrl)
        );
      } else {
        if (!selfie || !front) {
          setError(t("components.documentUpload.uploadBug"));
          console.error("Validation flags were true, but file data is missing. This is a bug.");
          return;
        }
        uploads.push(
          uploadFileAsBuffer(selfie, response.uploadUrls.selfieUploadUrl),
          uploadFileAsBuffer(front, response.uploadUrls.CNHUploadUrl)
        );
      }

      await Promise.all(uploads);
      onSubmitHandler();
    } catch {
      setError(t("components.documentUpload.uploadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    label: string,
    onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
    valid: boolean,
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  ) => (
    <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 hover:border-blue-500">
      <Icon className="mb-2 h-12 w-12 text-gray-400" />
      <span className="mb-1 text-gray-600">{label}</span>
      <input accept=".png,.jpeg,.jpg,.pdf" className="hidden" onChange={onChange} type="file" />
      {valid && <CheckCircleIcon className="absolute top-2 right-2 h-6 w-6 text-green-500" />}
    </label>
  );

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="mx-4 mt-8 mb-4 rounded-lg bg-white px-4 pt-6 pb-8 shadow-custom md:mx-auto md:w-96"
      initial={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="mb-6 text-center font-semibold text-2xl text-blue-700">{t("components.documentUpload.title")}</h2>
      <p className="mb-4 text-center text-gray-600">{t("components.documentUpload.description")}</p>

      <KycLevel2Toggle activeDocType={docType} onToggle={setDocType} />

      <div className="grid grid-cols-1 gap-4">
        {renderField(
          t("components.documentUpload.fields.uploadSelfie"),
          e => handleFileChange(e, setSelfie, setSelfieValid),
          selfieValid,
          CameraIcon
        )}
        {docType === BrlaKYCDocType.RG && (
          <>
            {renderField(
              t("components.documentUpload.fields.rgFront"),
              e => handleFileChange(e, setFront, setFrontValid),
              frontValid,
              DocumentTextIcon
            )}
            {renderField(
              t("components.documentUpload.fields.rgBack"),
              e => handleFileChange(e, setBack, setBackValid),
              backValid,
              DocumentTextIcon
            )}
          </>
        )}
        {docType === BrlaKYCDocType.CNH &&
          renderField(
            t("components.documentUpload.fields.cnhDocument"),
            e => handleFileChange(e, setFront, setFrontValid),
            frontValid,
            DocumentTextIcon
          )}
      </div>

      {error && <p className="mt-4 text-center text-red-500">{error}</p>}

      <div className="mt-8 flex gap-3">
        <button className="btn-vortex-primary-inverse btn flex-1" disabled={loading} onClick={onBackClick} type="button">
          {t("components.documentUpload.buttons.back")}
        </button>
        <button
          className="btn-vortex-primary btn flex-1"
          onClick={handleSubmit}
          type="button"
          {...buttonProps}
          disabled={buttonProps.disabled || isSubmitDisabled}
        >
          {isMaintenanceDisabled
            ? buttonProps.title
            : loading
              ? t("components.documentUpload.buttons.uploading")
              : t("components.documentUpload.buttons.finish")}
        </button>
      </div>
    </motion.div>
  );
};
