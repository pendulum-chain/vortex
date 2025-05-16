import { toast, ToastContainer, ToastContainerProps } from 'react-toastify';
import { Popover } from '../Popover';
import { useEffect } from 'react';

export const ToastPopover = (props: ToastContainerProps) => {
  console.log('RENDER TOASTPOPOVER');
  useEffect(() => {
    console.log('USEFFECT TOATPOPOVEr');
    toast('start');
  }, []);

  return (
    <Popover id="toast-container">
      <ToastContainer {...props} />
    </Popover>
  );
};
