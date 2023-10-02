import { ComponentChildren, JSX } from 'preact';
import { Modal, ModalProps } from 'react-daisyui';
import ModalCloseButton from '../../Button/ModalClose';
import TransactionProgress, { TransactionProgressProps } from '../../Transaction/Progress';

export type SwapProgressProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation?: TransactionProgressProps['mutation'];
  onClose: () => void;
  children?: ComponentChildren;
} & ModalProps;

const SwapProgress = ({ onClose, children, mutation, ...rest }: SwapProgressProps): JSX.Element | null => {
  return (
    <Modal {...rest}>
      <Modal.Header className="mb-0">
        <ModalCloseButton onClick={onClose} />
      </Modal.Header>
      <Modal.Body>
        {!!mutation && (
          <TransactionProgress mutation={mutation} onClose={onClose}>
            {children}
          </TransactionProgress>
        )}
      </Modal.Body>
    </Modal>
  );
};
export default SwapProgress;
