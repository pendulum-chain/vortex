import { CameraIcon, CheckCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrlaService, KYCDocType } from '../../../services/api';
import { KycLevel2Toggle } from '../../KycLevel2Toggle';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

interface DocumentUploadProps {
  onSubmitHandler: () => void;
  onBackClick: () => void;
  taxId: string;
}

async function uploadFileAsBuffer(file: File, url: string) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(uint8.length),
    },
    body: arrayBuffer,
  });

  if (!res.ok) {
    console.log('upload failed', res.statusText);
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onSubmitHandler, onBackClick, taxId }) => {
  const { t } = useTranslation();

  const [docType, setDocType] = useState<KYCDocType>(KYCDocType.RG);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const [selfieValid, setSelfieValid] = useState(false);
  const [frontValid, setFrontValid] = useState(false);
  const [backValid, setBackValid] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  if (!taxId) {
    console.error('Tax ID is not available');
    return null;
  }

  const validateAndSetFile = (
    file: File | null,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    validSetter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!file) {
      setter(null);
      validSetter(false);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('components.documentUpload.validation.invalidFileType'));
      setter(null);
      validSetter(false);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('components.documentUpload.validation.fileSizeExceeded', { max: '15 MB' }));
      setter(null);
      validSetter(false);
      return;
    }
    setError('');
    setter(file);
    validSetter(true);
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    validSetter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const file = e.target.files?.[0] || null;
    validateAndSetFile(file, setter, validSetter);
  };

  const isSubmitDisabled =
    loading || !selfieValid || (docType === KYCDocType.RG ? !frontValid || !backValid : !frontValid);

  const handleSubmit = async () => {
    setError('');
    if (
      !selfieValid ||
      (docType === KYCDocType.RG && (!frontValid || !backValid)) ||
      (docType === KYCDocType.CNH && !frontValid)
    ) {
      setError(t('components.documentUpload.validation.validationError'));
      return;
    }
    setLoading(true);
    try {
      const response = await BrlaService.startKYC2({
        taxId,
        documentType: docType,
      });

      const uploads: Promise<void>[] = [];
      if (docType === KYCDocType.RG) {
        if (!selfie || !front || !back) {
          setError(t('components.documentUpload.uploadBug'));
          console.error('Validation flags were true, but file data is missing. This is a bug.');
          return;
        }
        uploads.push(
          uploadFileAsBuffer(selfie, response.uploadUrls.selfieUploadUrl),
          uploadFileAsBuffer(front, response.uploadUrls.RGFrontUploadUrl),
          uploadFileAsBuffer(back, response.uploadUrls.RGBackUploadUrl),
        );
      } else {
        if (!selfie || !front) {
          setError(t('components.documentUpload.uploadBug'));
          console.error('Validation flags were true, but file data is missing. This is a bug.');
          return;
        }
        uploads.push(
          uploadFileAsBuffer(selfie, response.uploadUrls.selfieUploadUrl),
          uploadFileAsBuffer(front, response.uploadUrls.CNHUploadUrl),
        );
      }

      await Promise.all(uploads);
      onSubmitHandler();
    } catch {
      setError(t('components.documentUpload.uploadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    label: string,
    onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
    valid: boolean,
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>,
  ) => (
    <label className="relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-500">
      <Icon className="w-12 h-12 text-gray-400 mb-2" />
      <span className="text-gray-600 mb-1">{label}</span>
      <input type="file" accept=".png,.jpeg,.jpg,.pdf" onChange={onChange} className="hidden" />
      {valid && <CheckCircleIcon className="absolute top-2 right-2 w-6 h-6 text-green-500" />}
    </label>
  );

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pt-6 pb-8 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 bg-white"
    >
      <h2 className="text-2xl font-semibold text-center text-blue-700 mb-6">{t('components.documentUpload.title')}</h2>
      <p className="text-center text-gray-600 mb-4">{t('components.documentUpload.description')}</p>

      <KycLevel2Toggle activeDocType={docType} onToggle={setDocType} />

      <div className="grid grid-cols-1 gap-4">
        {renderField(
          t('components.documentUpload.fields.uploadSelfie'),
          (e) => handleFileChange(e, setSelfie, setSelfieValid),
          selfieValid,
          CameraIcon,
        )}
        {docType === KYCDocType.RG && (
          <>
            {renderField(
              t('components.documentUpload.fields.rgFront'),
              (e) => handleFileChange(e, setFront, setFrontValid),
              frontValid,
              DocumentTextIcon,
            )}
            {renderField(
              t('components.documentUpload.fields.rgBack'),
              (e) => handleFileChange(e, setBack, setBackValid),
              backValid,
              DocumentTextIcon,
            )}
          </>
        )}
        {docType === KYCDocType.CNH &&
          renderField(
            t('components.documentUpload.fields.cnhDocument'),
            (e) => handleFileChange(e, setFront, setFrontValid),
            frontValid,
            DocumentTextIcon,
          )}
      </div>

      {error && <p className="text-red-500 text-center mt-4">{error}</p>}

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          className="btn-vortex-primary-inverse btn flex-1"
          onClick={onBackClick}
          disabled={loading}
        >
          {t('components.documentUpload.buttons.back')}
        </button>
        <button
          type="button"
          className="btn-vortex-primary btn flex-1"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
        >
          {loading ? t('components.documentUpload.buttons.uploading') : t('components.documentUpload.buttons.finish')}
        </button>
      </div>
    </motion.div>
  );
};
