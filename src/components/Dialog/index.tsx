import { Modal } from 'react-daisyui';
import { FC, createPortal, useCallback, useEffect, useRef, useState } from 'preact/compat';

import { CloseButton } from '../buttons/CloseButton';

interface DialogProps {
  visible: boolean;
  onClose: () => void;
  headerText?: string;
  content: JSX.Element;
  actions?: JSX.Element;
  form?: {
    onSubmit: (event?: Event) => void | Promise<void>;
    className?: string;
  };
  id?: string;
}

export const Dialog: FC<DialogProps> = ({ visible, onClose, headerText, content, actions, id, form }) => {
  const ref = useRef<HTMLDialogElement>(null);

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
      onClose();
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
    const dialog = ref.current;
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
  }, [visible, closeListener, headerText]);

  const handleFormSubmit = (event: Event) => {
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
      <Modal.Body>{content}</Modal.Body>
      <Modal.Actions className="justify-center mt-4">{actions}</Modal.Actions>
    </>
  );

  return createPortal(
    <Modal className={`bg-base-200 border border-[--modal-border]`} id={id} ref={ref}>
      <Modal.Header className={`text-2xl claim-title flex mb-5 ${headerText ? 'justify-between' : 'justify-end'}`}>
        {headerText} <CloseButton onClick={onClose} />
      </Modal.Header>
      {form ? (
        <form onSubmit={handleFormSubmit} className={form.className} formMethod="dialog">
          {modalBody}
        </form>
      ) : (
        modalBody
      )}
    </Modal>,
    container,
  );
};
