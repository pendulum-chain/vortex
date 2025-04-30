import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  CameraIcon,
  DocumentTextIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { BrlaService, KYCDocType } from '../../../services/api';
import { useTaxId } from '../../../stores/ramp/useRampFormStore';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

interface DocumentUploadProps {
  onSubmitHandler: () => void;
  onBackClick: () => void;
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

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onSubmitHandler,
  onBackClick,
}) => {
  const taxId = useTaxId();

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
    validSetter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!file) {
      setter(null);
      validSetter(false);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid file type. Only PNG, JPEG, or PDF allowed.');
      setter(null);
      validSetter(false);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File size exceeds 15 MB limit.');
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
    validSetter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const file = e.target.files?.[0] || null;
    validateAndSetFile(file, setter, validSetter);
  };

  const isSubmitDisabled =
    loading ||
    !selfieValid ||
    (docType === KYCDocType.RG ? !frontValid || !backValid : !frontValid);

  const handleSubmit = async () => {
    setError('');
    if (
      !selfieValid ||
      (docType === KYCDocType.RG && (!frontValid || !backValid)) ||
      (docType === KYCDocType.CNH && !frontValid)
    ) {
      setError('All files must be valid before submitting.');
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
          setError('There was an error uploading the files for verification. Please try again later.');
          console.error('Validation flags were true, but file data is missing. This is a bug.');
          return;
        }
        uploads.push(
          uploadFileAsBuffer(selfie, response.uploadUrls.selfieUploadUrl),
          uploadFileAsBuffer(front, response.uploadUrls.RGFrontUploadUrl),
          uploadFileAsBuffer(back, response.uploadUrls.RGBackUploadUrl)
        );
      } else {

        if (!selfie || !front) {
          setError('There was an error uploading the files for verification. Please try again later.');
          console.error('Validation flags were true, but file data is missing. This is a bug.');
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
      setError('Upload failed. Please try again.');
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
    <label className="relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-500">
      <Icon className="w-12 h-12 text-gray-400 mb-2" />
      <span className="text-gray-600 mb-1">{label}</span>
      <input
        type="file"
        accept=".png,.jpeg,.jpg,.pdf"
        onChange={onChange}
        className="hidden"
      />
      {valid && (
        <CheckCircleIcon className="absolute top-2 right-2 w-6 h-6 text-green-500" />
      )}
    </label>
  );

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pt-6 pb-8 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 bg-white"
    >
      <h2 className="text-2xl font-semibold text-center text-blue-700 mb-6">
        Upload Your Documents
      </h2>

      <div className="flex gap-3 mb-6">
        <button
          type="button"
          className={`${docType === KYCDocType.RG ? 'btn-vortex-primary' : 'btn-vortex-primary-inverse'} btn flex-1`}
          onClick={() => setDocType(KYCDocType.RG)}
          disabled={loading}
        >
          RG
        </button>
        <button
          type="button"
          className={`${docType === KYCDocType.CNH ? 'btn-vortex-primary' : 'btn-vortex-primary-inverse'} btn flex-1`}
          onClick={() => setDocType(KYCDocType.CNH)}
          disabled={loading}
        >
          CNH
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {renderField(
          'Upload Selfie',
          (e) => handleFileChange(e, setSelfie, setSelfieValid),
          selfieValid,
          CameraIcon
        )}
        {docType === KYCDocType.RG && (
          <>
            {renderField(
              'RG Front',
              (e) => handleFileChange(e, setFront, setFrontValid),
              frontValid,
              DocumentTextIcon
            )}
            {renderField(
              'RG Back',
              (e) => handleFileChange(e, setBack, setBackValid),
              backValid,
              DocumentTextIcon
            )}
          </>
        )}
        {docType === KYCDocType.CNH && (
          renderField(
            'CNH Document',
            (e) => handleFileChange(e, setFront, setFrontValid),
            backValid,
            DocumentTextIcon
          )
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
          Back
        </button>
        <button
          type="button"
          className="btn-vortex-primary btn flex-1"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
        >
          {loading ? 'Uploading...' : 'Submit'}
        </button>
      </div>
    </motion.div>
  );
};
