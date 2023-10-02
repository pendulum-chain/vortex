import { FieldError } from 'react-hook-form';

export const errorClass = (err: FieldError | undefined, errClass = 'input-error', successClass = '') =>
  err ? errClass : successClass;
