import { Button, ButtonProps } from 'react-daisyui';

const ModalCloseButton = (props: ButtonProps): JSX.Element | null => (
  <Button size="sm" color="secondary" shape="circle" className="absolute right-2 top-2" type="button" {...props}>
    ✕
  </Button>
);
export default ModalCloseButton;
