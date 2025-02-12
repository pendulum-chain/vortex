import { FC, useCallback, useEffect, useRef, useState, FormEvent, JSX } from 'react';
import { createPortal } from 'react-dom';

import { CloseButton } from '../buttons/CloseButton';

interface DialogProps {
  visible: boolean;
  onClose?: () => void;
  headerText?: string;
  content: JSX.Element;
  actions?: JSX.Element;
  form?: {
    onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
    className?: string;
  };
  id?: string;
  disableNativeEvents?: boolean;
  hideCloseButton?: boolean;
}

export const Dialog: FC<DialogProps> = ({
  visible,
  onClose,
  headerText,
  content,
  actions,
  id,
  form,
  disableNativeEvents = false,
  hideCloseButton = false,
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const dialog = ref.current;

  // If it was the form submission we want to only close the dialog without calling onClose
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = useCallback(
    (dialog: HTMLDialogElement) => {
      if (isSubmitting) {
        setIsSubmitting(false);
        dialog.close();
        return;
      }

      dialog.close();
      onClose && onClose();
    },
    [isSubmitting, onClose],
  );

  const closeListener = useCallback(() => {
    const dialog = ref.current;
    if (dialog) {
      handleClose(dialog);
    }
  }, [handleClose]);

  // Manage native <dialog> events and visibility
  useEffect(() => {
    if (dialog) {
      dialog.addEventListener('close', closeListener);
      if (visible && !dialog.open) {
        dialog.showModal();
      } else if (!visible && dialog.open) {
        dialog.close();
      }

      return () => {
        dialog.removeEventListener('close', closeListener);
      };
    }
  }, [visible, closeListener, headerText, dialog]);

  // This useEffect handles disableNativeEvents ( prevents the dialog from closing on Escape key press )
  useEffect(() => {
    if (!disableNativeEvents || !dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (disableNativeEvents && e.key === 'Escape') {
        e.preventDefault();
        return;
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);

    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  }, [disableNativeEvents, headerText, dialog]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (form) {
      setIsSubmitting(true);
      event.preventDefault();
      form.onSubmit(event);
    }
  };

  const container = document.getElementById('modals');
  if (!container) return null;

  const modalBody = (
    <>
      <div className="modal-body">{content}</div>
      <div className="justify-center mt-4 modal-action">{actions}</div>
    </>
  );

  return createPortal(
    <dialog className="modal border border-[--modal-border]" id={id} ref={ref} aria-labelledby={`${headerText}-header`}>
      <div className="modal-box bg-base-200">
        <div
          className={`text-2xl claim-title items-center flex mb-5 ${headerText ? 'justify-between' : 'justify-end'}`}
        >
          <span>{headerText}</span> {hideCloseButton ? <></> : <CloseButton onClick={onClose} />}
        </div>
        {form ? (
          <form onSubmit={handleFormSubmit} className={form.className} method="dialog">
            {modalBody}
          </form>
        ) : (
          modalBody
        )}
      </div>
    </dialog>,
    container,
  );
};
